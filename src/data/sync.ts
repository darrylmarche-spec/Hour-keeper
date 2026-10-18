// Moves changes between this device and the server.
//
//  push: send queued changes, oldest first. A connection problem stops the run
//        (try again later); a refusal from the server marks that one change as
//        rejected and moves on, so one bad change never blocks the rest.
//  pull: fetch rows changed since the last sync, table by table.

import { Cursor, LocalStore } from './localStore';
import { BaseRow, JOB_CHILD_TABLES, TableName, TABLES } from './schema';

export type RemoteErrorKind = 'network' | 'auth' | 'rejected';

export class RemoteError extends Error {
  constructor(
    public kind: RemoteErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface Remote {
  upsert(table: TableName, row: BaseRow): Promise<BaseRow | null>;
  // Rows with (updated_at, id) strictly after the cursor, oldest first.
  pull(table: TableName, after: Cursor | null, limit: number, jobId?: string): Promise<BaseRow[]>;
  listJobIds(): Promise<string[]>;
}

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'signed-out';

export interface SyncState {
  phase: SyncPhase;
  pending: number;
  rejected: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const PAGE = 500;
// Re-read a little history each run so a change committed slightly out of
// order on the server is never skipped. Rows are merged by id, so re-reading
// is harmless.
const OVERLAP_MS = 2 * 60 * 1000;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// Postgres timestamps carry microseconds ("…:11.098123+00:00"), which not
// every JS engine parses; trim to milliseconds first.
export function parseTs(ts: string): number {
  const m = /^(.*T\d\d:\d\d:\d\d)(\.\d+)?(Z|[+-]\d\d:?\d\d)?$/.exec(ts);
  if (!m) return Date.parse(ts);
  const frac = m[2] ? m[2].slice(0, 4) : '';
  const zone = !m[3] || m[3] === '+00:00' || m[3] === '+0000' ? 'Z' : m[3];
  return Date.parse(`${m[1]}${frac}${zone}`);
}

export class SyncEngine {
  private running: Promise<void> | null = null;
  private again = false;
  private state: SyncState;
  private listeners = new Set<() => void>();

  constructor(
    private store: LocalStore,
    private remote: Remote,
  ) {
    this.state = {
      phase: 'idle',
      pending: store.pendingCount(),
      rejected: store.rejectedItems().length,
      lastSyncedAt: null,
      lastError: null,
    };
    store.subscribe(() => this.refreshCounts());
  }

  getState(): SyncState {
    return this.state;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  private refreshCounts(): void {
    const pending = this.store.pendingCount();
    const rejected = this.store.rejectedItems().length;
    if (pending !== this.state.pending || rejected !== this.state.rejected) {
      this.set({ pending, rejected });
    }
  }

  // Safe to call as often as you like: runs are never concurrent, and a call
  // made during a run schedules exactly one more run afterwards.
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await this.runOnce();
      } while (this.again);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runOnce(): Promise<void> {
    this.set({ phase: 'syncing' });
    try {
      await this.push();
      await this.pull();
      this.set({ phase: 'idle', lastSyncedAt: new Date().toISOString(), lastError: null });
    } catch (e) {
      if (e instanceof RemoteError && e.kind === 'network') {
        this.set({ phase: 'offline', lastError: null });
      } else if (e instanceof RemoteError && e.kind === 'auth') {
        this.set({ phase: 'signed-out', lastError: e.message });
      } else {
        this.set({ phase: 'idle', lastError: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  private async push(): Promise<void> {
    for (;;) {
      const item = this.store.nextToSend();
      if (!item) return;
      this.store.markInFlight(item.seq);
      try {
        const serverRow = await this.remote.upsert(item.table, item.row);
        await this.store.ack(item.seq, serverRow);
      } catch (e) {
        if (e instanceof RemoteError && e.kind === 'rejected') {
          await this.store.reject(item.seq, e.message);
          continue;
        }
        await this.store.noteAttempt(item.seq);
        throw e;
      } finally {
        this.store.markInFlight(null);
      }
    }
  }

  private async pull(): Promise<void> {
    for (const table of TABLES) {
      await this.pullTable(table);
      if (table === 'jobs') await this.catchUpNewJobs();
    }
  }

  private async pullTable(table: TableName): Promise<void> {
    const saved = this.store.cursor(table);
    let after: Cursor | null = saved
      ? { ts: new Date(parseTs(saved.ts) - OVERLAP_MS).toISOString(), id: ZERO_UUID }
      : null;
    let last: Cursor | null = saved ?? null;
    for (;;) {
      const rows = await this.remote.pull(table, after, PAGE);
      this.store.applyRemote(table, rows);
      if (rows.length) {
        const tail = rows[rows.length - 1];
        after = { ts: tail.updated_at!, id: tail.id };
        if (!last || after.ts > last.ts || (after.ts === last.ts && after.id > last.id)) last = after;
      }
      if (rows.length < PAGE) break;
    }
    if (last) await this.store.setCursor(table, last);
  }

  // A job that has just become visible here (newly assigned, or just
  // released) may have tasks and other rows older than this device's cursors.
  // Fetch those in full. Also drop jobs this user can no longer see.
  private async catchUpNewJobs(): Promise<void> {
    const visible = await this.remote.listJobIds();
    const visibleSet = new Set(visible);
    this.store.pruneJobs(visibleSet, JOB_CHILD_TABLES);
    const fresh = visible.filter((id) => !this.store.isKnownJob(id));
    // A table with no cursor yet is about to be pulled in full anyway.
    const behind = JOB_CHILD_TABLES.filter((t) => this.store.cursor(t));
    for (const jobId of fresh) {
      for (const table of behind) {
        let after: Cursor | null = null;
        for (;;) {
          const rows = await this.remote.pull(table, after, PAGE, jobId);
          this.store.applyRemote(table, rows);
          if (rows.length < PAGE) break;
          const tail = rows[rows.length - 1];
          after = { ts: tail.updated_at!, id: tail.id };
        }
      }
    }
    if (fresh.length) await this.store.markJobsKnown(fresh);
  }
}
