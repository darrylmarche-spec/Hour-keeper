// The device's own copy of the data.
//
// Every read in the app comes from here, so screens work the same with or
// without signal. Every write lands here first and is queued in the outbox;
// the sync engine pushes the outbox to the server when it can.

import { BaseRow, RETIRED_COLUMNS, TableName, TABLES } from './schema';

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
  // The item stays so the user can see it and decide what to do with it.
  rejected?: string;
  // What the row looked like on the server when this edit began. Only the
  // fields that differ from it are sent, and only if nobody else has changed
  // those fields meanwhile. Missing for new rows, and for changes queued by an
  // older version of the app (those are sent whole, as before).
  base?: BaseRow;
  // The row was edited again while an earlier edit of it was still being sent;
  // its base is the server's copy once that earlier edit is accepted.
  baseFromAck?: boolean;
  // The person chose "use my version" after a clash: send it without the check.
  force?: boolean;
  // After a clash: the other person's version, as the server has it now.
  theirs?: BaseRow;
}

export interface Cursor {
  ts: string;
  id: string;
}

type Listener = () => void;

const EMPTY: readonly BaseRow[] = Object.freeze([]);

// Removes columns that moved to the office-only tables. True if anything was removed.
function dropRetired(table: TableName, row: object): boolean {
  let removed = false;
  for (const c of RETIRED_COLUMNS[table] ?? []) {
    if (c in row) {
      delete (row as Record<string, unknown>)[c];
      removed = true;
    }
  }
  return removed;
}

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
      let scrubbed = false;
      if (raw) {
        for (const row of JSON.parse(raw) as BaseRow[]) {
          scrubbed = dropRetired(t, row) || scrubbed;
          map.set(row.id, row);
        }
      }
      this.tables.set(t, map);
      if (scrubbed) await this.saveTableNow(t);
    }
    const ob = await this.storage.getItem(this.key('outbox'));
    this.outbox = ob ? JSON.parse(ob) : [];
    // Figures an older version of the app kept on this phone are removed, in
    // saved rows and in changes still waiting to send.
    let outboxScrubbed = false;
    for (const item of this.outbox) {
      outboxScrubbed = dropRetired(item.table, item.row) || outboxScrubbed;
      if (item.base) outboxScrubbed = dropRetired(item.table, item.base) || outboxScrubbed;
    }
    if (outboxScrubbed) await this.storage.setItem(this.key('outbox'), JSON.stringify(this.outbox));
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

  // Includes removed (soft-deleted) rows — for bringing one back rather than
  // creating a duplicate.
  findAny<T extends BaseRow>(table: TableName, pred: (row: T) => boolean): T | undefined {
    for (const row of this.tables.get(table)!.values()) if (pred(row as T)) return row as T;
    return undefined;
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
    await this.writeMany([{ table, row }]);
    return row;
  }

  // Save several rows at once (e.g. a whole job: job, phases, tasks). They're
  // queued in the order given, so parents reach the server before children.
  async writeMany(items: { table: TableName; row: BaseRow }[]): Promise<void> {
    if (!items.length) return;
    const touched = new Set<TableName>();
    for (const { table, row: given } of items) {
      const previous = this.tables.get(table)!.get(given.id);
      // A row given with only some of its fields (e.g. just a new sold figure)
      // keeps the rest of what is already stored, including the server's updated_at,
      // so it is treated as an edit of a row the server has, not as a new row.
      const row = previous ? { ...previous, ...given } : given;
      this.tables.get(table)!.set(row.id, row);
      this.changed(table);
      touched.add(table);

      // Collapse repeated edits to the same row into one queued change,
      // unless that change is being sent right now. The original base is kept:
      // it is what the row was when the first of these edits began.
      const existing = this.outbox.find(
        (i) => i.table === table && i.row.id === row.id && i.seq !== this.inFlightSeq && !i.rejected,
      );
      if (existing) {
        existing.row = row;
        existing.attempts = 0;
      } else {
        const item: OutboxItem = {
          seq: this.nextSeq++,
          table,
          row,
          queuedAt: new Date().toISOString(),
          attempts: 0,
        };
        // An edit to a row the server already has: remember what it was.
        if (previous?.updated_at) {
          const sending = this.outbox.some((i) => i.table === table && i.row.id === row.id && i.seq === this.inFlightSeq);
          if (sending) item.baseFromAck = true;
          else item.base = { ...previous };
        }
        this.outbox.push(item);
      }
    }
    await Promise.all([...Array.from(touched, (t) => this.saveTableNow(t)), this.saveOutbox()]);
    this.emit();
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

  // Waiting to be sent (a change the server already refused doesn't count).
  hasUnsent(table: TableName, id: string): boolean {
    return this.outbox.some((i) => i.table === table && i.row.id === id && !i.rejected);
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
    if (item) {
      // An edit made while this one was being sent now starts from the server's copy.
      for (const other of this.outbox) {
        if (other.table === item.table && other.row.id === item.row.id && other.baseFromAck) {
          other.baseFromAck = false;
          if (serverRow) other.base = { ...serverRow };
        }
      }
    }
    if (item && serverRow && !this.hasUnsent(item.table, item.row.id)) {
      this.tables.get(item.table)!.set(serverRow.id, serverRow);
      this.changed(item.table);
      this.saveTableSoon(item.table);
    }
    await this.saveOutbox();
    this.emit();
  }

  // `theirs` is given when the refusal is a clash: someone else changed the same
  // thing. Their version is shown on this device from now on; the person's own
  // version stays in the list, untouched, until they choose.
  async reject(seq: number, reason: string, theirs?: BaseRow): Promise<void> {
    const item = this.outbox.find((i) => i.seq === seq);
    if (item) {
      item.rejected = reason;
      item.attempts += 1;
      // Edits queued behind this one were made on top of it; they start from the same base.
      for (const other of this.outbox) {
        if (other.table === item.table && other.row.id === item.row.id && other.baseFromAck) {
          other.baseFromAck = false;
          other.base = item.base ? { ...item.base } : undefined;
        }
      }
      if (theirs) {
        item.theirs = theirs;
        if (!this.hasUnsent(item.table, item.row.id)) {
          this.tables.get(item.table)!.set(theirs.id, theirs);
          this.changed(item.table);
          await this.saveTableNow(item.table);
        }
      }
    }
    await this.saveOutbox();
    this.emit();
  }

  // After a clash the person picks one:
  //  'theirs' keeps what is on the server now and lets go of their own version.
  //  'mine'   sends their version anyway (the server records both in the history).
  async resolveConflict(seq: number, choice: 'mine' | 'theirs'): Promise<void> {
    const item = this.outbox.find((i) => i.seq === seq);
    if (!item) return;
    // A newer edit of the same row may be queued behind this one; it stays on top.
    const newerEdit = this.outbox.some((i) => i.seq !== seq && i.table === item.table && i.row.id === item.row.id && !i.rejected);
    if (choice === 'theirs') {
      this.outbox = this.outbox.filter((i) => i.seq !== seq);
    } else {
      item.rejected = undefined;
      item.force = true;
      item.attempts = 0;
      if (!newerEdit) {
        this.tables.get(item.table)!.set(item.row.id, item.row);
        this.changed(item.table);
        await this.saveTableNow(item.table);
      }
    }
    await this.saveOutbox();
    this.emit();
  }

  // Why a change to this row was refused, if it was.
  rejectedReason(table: TableName, id: string): string | null {
    return this.outbox.find((i) => i.table === table && i.row.id === id && i.rejected)?.rejected ?? null;
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
  // A change the server refused is no longer waiting: the server's version is
  // shown, and the refused change stays listed (with the reason) until the
  // person deals with it.
  applyRemote(table: TableName, rows: BaseRow[]): void {
    if (!rows.length) return;
    const map = this.tables.get(table)!;
    for (const row of rows) {
      if (this.hasUnsent(table, row.id)) continue;
      map.set(row.id, row);
    }
    this.changed(table);
    this.saveTableSoon(table);
    this.emit();
  }

  // Drop jobs (and everything under them) this user can no longer see,
  // e.g. after being taken off a job. Refused changes stay listed in the
  // outbox for the user to review, but don't keep the job on the device.
  pruneJobs(visibleJobIds: Set<string>, childTables: TableName[]): void {
    const jobs = this.tables.get('jobs')!;
    const gone = Array.from(jobs.keys()).filter((id) => !visibleJobIds.has(id));
    if (!gone.length) return;
    const goneSet = new Set(gone);
    for (const id of gone) {
      if (!this.hasUnsent('jobs', id)) jobs.delete(id);
    }
    this.changed('jobs');
    this.saveTableSoon('jobs');
    for (const t of childTables) {
      const map = this.tables.get(t)!;
      let removed = false;
      for (const [id, row] of map) {
        const jobId = (row as BaseRow & { job_id?: string }).job_id;
        if (jobId && goneSet.has(jobId) && !this.hasUnsent(t, id)) {
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
