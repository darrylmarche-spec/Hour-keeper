// The device's own copy of the data.
//
// Every read in the app comes from here, so screens work the same with or
// without signal. Every write lands here first and is queued in the outbox;
// the sync engine pushes the outbox to the server when it can.

import { BaseRow, TableName, TABLES } from './schema';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface OutboxItem {
  seq: number;
  table: TableName;
  row: BaseRow;
  queuedAt: string;
  attempts: number;
  // Set when the server refused the change (not a connection problem).
  // The item stays so the user can see it and decide to discard it.
  rejected?: string;
}

export interface Cursor {
  ts: string;
  id: string;
}

type Listener = () => void;

const EMPTY: readonly BaseRow[] = Object.freeze([]);

export class LocalStore {
  private tables = new Map<TableName, Map<string, BaseRow>>();
  private snapshots = new Map<TableName, readonly BaseRow[]>();
  private outbox: OutboxItem[] = [];
  private cursors: Partial<Record<TableName, Cursor>> = {};
  private knownJobIds = new Set<string>();
  private nextSeq = 1;
  private inFlightSeq: number | null = null;
  private listeners = new Set<Listener>();
  private loaded = false;
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private storage: KeyValueStorage,
    private prefix: string,
  ) {
    for (const t of TABLES) this.tables.set(t, new Map());
  }

  // ── Loading & persistence ────────────────────────────────────

  async load(): Promise<void> {
    for (const t of TABLES) {
      const raw = await this.storage.getItem(this.key(`t:${t}`));
      const map = new Map<string, BaseRow>();
      if (raw) for (const row of JSON.parse(raw) as BaseRow[]) map.set(row.id, row);
      this.tables.set(t, map);
    }
    const ob = await this.storage.getItem(this.key('outbox'));
    this.outbox = ob ? JSON.parse(ob) : [];
    this.nextSeq = this.outbox.reduce((m, i) => Math.max(m, i.seq + 1), 1);
    const cur = await this.storage.getItem(this.key('cursors'));
    this.cursors = cur ? JSON.parse(cur) : {};
    const known = await this.storage.getItem(this.key('knownJobs'));
    this.knownJobIds = new Set(known ? JSON.parse(known) : []);
    this.snapshots.clear();
    this.loaded = true;
    this.emit();
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  private key(k: string): string {
    return `${this.prefix}:${k}`;
  }

  private async saveTableNow(table: TableName): Promise<void> {
    const rows = Array.from(this.tables.get(table)!.values());
    await this.storage.setItem(this.key(`t:${table}`), JSON.stringify(rows));
  }

  // Server data can be re-fetched, so it's saved on a short debounce.
  private saveTableSoon(table: TableName): void {
    const k = `t:${table}`;
    const existing = this.saveTimers.get(k);
    if (existing) clearTimeout(existing);
    this.saveTimers.set(
      k,
      setTimeout(() => {
        this.saveTimers.delete(k);
        void this.saveTableNow(table);
      }, 250),
    );
  }

  private async saveOutbox(): Promise<void> {
    await this.storage.setItem(this.key('outbox'), JSON.stringify(this.outbox));
  }

  async flush(): Promise<void> {
    const pending = Array.from(this.saveTimers.keys());
    for (const k of pending) {
      clearTimeout(this.saveTimers.get(k)!);
      this.saveTimers.delete(k);
      await this.saveTableNow(k.slice(2) as TableName);
    }
  }

  // ── Reading ──────────────────────────────────────────────────

  // Returns a stable array (same reference until the table changes),
  // suitable for React's useSyncExternalStore.
  all<T extends BaseRow>(table: TableName): readonly T[] {
    let snap = this.snapshots.get(table);
    if (!snap) {
      const rows = Array.from(this.tables.get(table)!.values()).filter((r) => !r.deleted_at);
      snap = rows.length ? Object.freeze(rows) : EMPTY;
      this.snapshots.set(table, snap);
    }
    return snap as readonly T[];
  }

  get<T extends BaseRow>(table: TableName, id: string): T | undefined {
    const row = this.tables.get(table)!.get(id);
    return row && !row.deleted_at ? (row as T) : undefined;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(table: TableName): void {
    this.snapshots.delete(table);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  // ── Local writes ─────────────────────────────────────────────

  // Save a row on this device and queue it for the server. Awaited so the
  // change survives the app being closed straight after.
  async write<T extends BaseRow>(table: TableName, row: T): Promise<T> {
    this.tables.get(table)!.set(row.id, row);
    this.changed(table);

    // Collapse repeated edits to the same row into one queued change,
    // unless that change is being sent right now.
    const existing = this.outbox.find(
      (i) => i.table === table && i.row.id === row.id && i.seq !== this.inFlightSeq,
    );
    if (existing) {
      existing.row = row;
      existing.rejected = undefined;
      existing.attempts = 0;
    } else {
      this.outbox.push({
        seq: this.nextSeq++,
        table,
        row,
        queuedAt: new Date().toISOString(),
        attempts: 0,
      });
    }
    await Promise.all([this.saveTableNow(table), this.saveOutbox()]);
    this.emit();
    return row;
  }

  // ── Outbox (used by the sync engine) ─────────────────────────

  pending(): readonly OutboxItem[] {
    return this.outbox;
  }

  pendingCount(): number {
    return this.outbox.filter((i) => !i.rejected).length;
  }

  rejectedItems(): OutboxItem[] {
    return this.outbox.filter((i) => i.rejected);
  }

  hasPending(table: TableName, id: string): boolean {
    return this.outbox.some((i) => i.table === table && i.row.id === id);
  }

  nextToSend(): OutboxItem | undefined {
    return this.outbox.find((i) => !i.rejected);
  }

  markInFlight(seq: number | null): void {
    this.inFlightSeq = seq;
  }

  // The server accepted the change. Store the server's version of the row
  // (it carries server-set fields like updated_at and edited) unless the user
  // has changed the row again in the meantime.
  async ack(seq: number, serverRow: BaseRow | null): Promise<void> {
    const item = this.outbox.find((i) => i.seq === seq);
    this.outbox = this.outbox.filter((i) => i.seq !== seq);
    if (item && serverRow && !this.hasPending(item.table, item.row.id)) {
      this.tables.get(item.table)!.set(serverRow.id, serverRow);
      this.changed(item.table);
      this.saveTableSoon(item.table);
    }
    await this.saveOutbox();
    this.emit();
  }

  async reject(seq: number, reason: string): Promise<void> {
    const item = this.outbox.find((i) => i.seq === seq);
    if (item) {
      item.rejected = reason;
      item.attempts += 1;
    }
    await this.saveOutbox();
    this.emit();
  }

  async noteAttempt(seq: number): Promise<void> {
    const item = this.outbox.find((i) => i.seq === seq);
    if (item) item.attempts += 1;
    await this.saveOutbox();
  }

  // Throw away a change the server refused, and restore the server's copy
  // on the next pull.
  async discard(seq: number): Promise<void> {
    const item = this.outbox.find((i) => i.seq === seq);
    this.outbox = this.outbox.filter((i) => i.seq !== seq);
    if (item && !this.hasPending(item.table, item.row.id)) {
      this.tables.get(item.table)!.delete(item.row.id);
      this.changed(item.table);
      this.cursors[item.table] = undefined;
      await Promise.all([this.saveTableNow(item.table), this.saveCursors()]);
    }
    await this.saveOutbox();
    this.emit();
  }

  // ── Server data (used by the sync engine) ────────────────────

  // Merge rows from the server. A row with a local change still waiting to be
  // sent keeps the local version — the user's latest edit wins until it's sent.
  applyRemote(table: TableName, rows: BaseRow[]): void {
    if (!rows.length) return;
    const map = this.tables.get(table)!;
    for (const row of rows) {
      if (this.hasPending(table, row.id)) continue;
      map.set(row.id, row);
    }
    this.changed(table);
    this.saveTableSoon(table);
    this.emit();
  }

  // Drop jobs (and everything under them) this user can no longer see,
  // e.g. after being taken off a job.
  pruneJobs(visibleJobIds: Set<string>, childTables: TableName[]): void {
    const jobs = this.tables.get('jobs')!;
    const gone = Array.from(jobs.keys()).filter((id) => !visibleJobIds.has(id));
    if (!gone.length) return;
    const goneSet = new Set(gone);
    for (const id of gone) {
      if (!this.hasPending('jobs', id)) jobs.delete(id);
    }
    this.changed('jobs');
    this.saveTableSoon('jobs');
    for (const t of childTables) {
      const map = this.tables.get(t)!;
      let removed = false;
      for (const [id, row] of map) {
        const jobId = (row as BaseRow & { job_id?: string }).job_id;
        if (jobId && goneSet.has(jobId) && !this.hasPending(t, id)) {
          map.delete(id);
          removed = true;
        }
      }
      if (removed) {
        this.changed(t);
        this.saveTableSoon(t);
      }
    }
    for (const id of gone) this.knownJobIds.delete(id);
    void this.saveKnownJobs();
    this.emit();
  }

  cursor(table: TableName): Cursor | undefined {
    return this.cursors[table];
  }

  async setCursor(table: TableName, cursor: Cursor): Promise<void> {
    this.cursors[table] = cursor;
    await this.saveCursors();
  }

  private async saveCursors(): Promise<void> {
    await this.storage.setItem(this.key('cursors'), JSON.stringify(this.cursors));
  }

  isKnownJob(id: string): boolean {
    return this.knownJobIds.has(id);
  }

  async markJobsKnown(ids: string[]): Promise<void> {
    for (const id of ids) this.knownJobIds.add(id);
    await this.saveKnownJobs();
  }

  private async saveKnownJobs(): Promise<void> {
    await this.storage.setItem(this.key('knownJobs'), JSON.stringify(Array.from(this.knownJobIds)));
  }
}
