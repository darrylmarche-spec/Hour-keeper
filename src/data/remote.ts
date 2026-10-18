import type { SupabaseClient } from '@supabase/supabase-js';
import { Cursor } from './localStore';
import { BaseRow, NUMERIC_COLUMNS, TableName } from './schema';
import { Remote, RemoteError } from './sync';

// Columns the server owns. Sending them would be ignored by triggers anyway;
// leaving them out keeps requests honest.
const SERVER_OWNED = ['updated_at'];

// Normalise "…+00:00" to "…Z" so the value is safe inside a PostgREST filter.
function filterTs(ts: string): string {
  return ts.replace(/\+00:?00$/, 'Z');
}

function normalise(table: TableName, row: Record<string, unknown>): BaseRow {
  const cols = NUMERIC_COLUMNS[table];
  if (cols) {
    for (const c of cols) {
      const v = row[c];
      if (typeof v === 'string') row[c] = Number(v);
    }
  }
  return row as unknown as BaseRow;
}

interface PgError {
  message: string;
  code?: string;
  status?: number;
}

export function classifyError(err: PgError | Error | unknown, status?: number): RemoteError {
  const e = err as PgError;
  const msg = e?.message ?? String(err);
  const code = e?.code ?? '';
  if (
    err instanceof TypeError ||
    /fetch failed|network|failed to fetch|load failed|timed? ?out|ECONN|ENOTFOUND/i.test(msg) ||
    status === 0 ||
    (status !== undefined && status >= 500)
  ) {
    return new RemoteError('network', msg);
  }
  if (status === 401 || code === 'PGRST301' || code === 'PGRST303' || /JWT/i.test(msg)) {
    return new RemoteError('auth', msg);
  }
  return new RemoteError('rejected', friendly(code, msg));
}

function friendly(code: string, msg: string): string {
  if (code === '42501' || /row-level security/i.test(msg)) {
    return "You don't have permission to make this change (the job may have been closed or reassigned).";
  }
  if (code.startsWith('23')) return `The server rejected this change: ${msg}`;
  return msg;
}

export class SupabaseRemote implements Remote {
  constructor(private client: SupabaseClient) {}

  // New rows (never confirmed by the server, so no updated_at yet) are
  // inserted; rows that came from the server are updated. A plain upsert
  // isn't used because Postgres checks the INSERT rule even when the row
  // exists, which would refuse legitimate edits (e.g. a PM correcting a
  // tech's hours, or anyone editing their profile).
  async upsert(table: TableName, row: BaseRow): Promise<BaseRow | null> {
    const body: Record<string, unknown> = { ...row };
    for (const k of SERVER_OWNED) delete body[k];

    if (!row.updated_at) {
      const ins = await this.run(() => this.client.from(table).insert(body).select().maybeSingle());
      if (!ins.error) return ins.data ? normalise(table, ins.data) : null;
      // Already there: an earlier send reached the server but the reply was lost.
      if (ins.error.code !== '23505') throw classifyError(ins.error, ins.status);
    }

    const { id, ...changes } = body;
    const upd = await this.run(() => this.client.from(table).update(changes).eq('id', id).select().maybeSingle());
    if (upd.error) throw classifyError(upd.error, upd.status);
    if (!upd.data) {
      throw new RemoteError(
        'rejected',
        "You don't have permission to make this change (the job may have been closed or reassigned).",
      );
    }
    return normalise(table, upd.data);
  }

  private async run<T>(fn: () => PromiseLike<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw classifyError(e);
    }
  }

  async pull(table: TableName, after: Cursor | null, limit: number, jobId?: string): Promise<BaseRow[]> {
    let q = this.client.from(table).select('*');
    if (jobId) q = q.eq('job_id', jobId);
    if (after) {
      const ts = filterTs(after.ts);
      q = q.or(`updated_at.gt."${ts}",and(updated_at.eq."${ts}",id.gt.${after.id})`);
    }
    let res;
    try {
      res = await q.order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(limit);
    } catch (e) {
      throw classifyError(e);
    }
    if (res.error) throw classifyError(res.error, res.status);
    return (res.data ?? []).map((r) => normalise(table, r as Record<string, unknown>));
  }

  async listJobIds(): Promise<string[]> {
    const ids: string[] = [];
    for (let from = 0; ; from += 1000) {
      let res;
      try {
        res = await this.client
          .from('jobs')
          .select('id')
          .is('deleted_at', null)
          .order('id')
          .range(from, from + 999);
      } catch (e) {
        throw classifyError(e);
      }
      if (res.error) throw classifyError(res.error, res.status);
      const page = (res.data ?? []) as { id: string }[];
      ids.push(...page.map((r) => r.id));
      if (page.length < 1000) return ids;
    }
  }
}
