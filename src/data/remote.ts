import type { SupabaseClient } from '@supabase/supabase-js';
import { changedFields, clashingFields, CONFLICT_MESSAGE, NOT_ALLOWED_MESSAGE } from './conflicts';
import { Cursor } from './localStore';
import { BaseRow, NUMERIC_COLUMNS, RETIRED_COLUMNS, TableName } from './schema';
import { Remote, RemoteError, UpsertOptions } from './sync';

// Columns the server owns. Sending them would be ignored by triggers anyway;
// leaving them out keeps requests honest.
const SERVER_OWNED = ['updated_at'];

// Normalise "…+00:00" to "…Z" so the value is safe inside a PostgREST filter.
function filterTs(ts: string): string {
  return ts.replace(/\+00:?00$/, 'Z');
}

function normalise(table: TableName, row: Record<string, unknown>): BaseRow {
  for (const c of RETIRED_COLUMNS[table] ?? []) delete row[c];
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
  if (code === '42501' || /row-level security/i.test(msg)) return NOT_ALLOWED_MESSAGE;
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
  //
  // An update sends only the fields that were changed, and (unless forced)
  // only applies if nobody else has changed those same fields since the edit
  // began. If someone has, nothing is overwritten: the other person's version
  // is handed back so the person can choose.
  async upsert(table: TableName, row: BaseRow, opts: UpsertOptions = {}): Promise<BaseRow | null> {
    const body: Record<string, unknown> = { ...row };
    for (const k of SERVER_OWNED) delete body[k];

    if (!row.updated_at) {
      const ins = await this.run(() => this.client.from(table).insert(body).select().maybeSingle());
      if (!ins.error) return ins.data ? normalise(table, ins.data) : null;
      // Already there: an earlier send reached the server but the reply was lost.
      if (ins.error.code !== '23505') throw classifyError(ins.error, ins.status);
    }

    const { id, ...rest } = body;
    const base = opts.base as Record<string, unknown> | undefined;
    const changes = base ? changedFields(rest, base) : rest; // no base: an older queued change, sent whole
    if (base && Object.keys(changes).length === 0) return null; // nothing differs from what the server had

    let q = this.client.from(table).update(changes).eq('id', id);
    if (base && !opts.force) {
      for (const k of Object.keys(changes)) {
        const was = base[k];
        q = was === null || was === undefined ? q.is(k, null) : q.eq(k, was as string | number | boolean);
      }
    }
    const upd = await this.run(() => q.select().maybeSingle());
    if (upd.error) throw classifyError(upd.error, upd.status);
    if (upd.data) return normalise(table, upd.data);

    // Nothing was updated: either someone else changed these fields first, or
    // the server won't let this person change the row.
    if (base && !opts.force) {
      const cur = await this.run(() => this.client.from(table).select('*').eq('id', id).maybeSingle());
      if (!cur.error && cur.data) {
        const theirs = normalise(table, cur.data as Record<string, unknown>);
        if (clashingFields(changes, base, theirs as unknown as Record<string, unknown>).length) {
          throw new RemoteError('rejected', CONFLICT_MESSAGE, theirs);
        }
      }
    }
    throw new RemoteError('rejected', NOT_ALLOWED_MESSAGE);
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
