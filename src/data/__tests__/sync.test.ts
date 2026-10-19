import { Cursor, KeyValueStorage, LocalStore } from '../localStore';
import { BaseRow, TableName } from '../schema';
import { parseTs, Remote, RemoteError, SyncEngine } from '../sync';

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  async getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  async setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  async removeItem(k: string) {
    this.data.delete(k);
  }
}

// An in-memory stand-in for Supabase with a controllable clock, connection,
// refusals and job visibility.
class FakeServer implements Remote {
  tables = new Map<TableName, Map<string, BaseRow>>();
  online = true;
  clock = Date.parse('2026-10-01T00:00:00Z');
  rejectIds = new Set<string>();
  visibleJobs: Set<string> | null = null; // null = all
  upserts: string[] = [];

  private t(name: TableName) {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }

  // Server-side write, as if another user or the database did it.
  put(table: TableName, row: Omit<BaseRow, 'updated_at'> & Record<string, unknown>, at?: number) {
    const ts = new Date(at ?? (this.clock += 1000)).toISOString();
    const stored = { ...row, updated_at: ts } as BaseRow;
    this.t(table).set(row.id, stored);
    return stored;
  }

  private visible(table: TableName, row: BaseRow & { job_id?: string }) {
    if (!this.visibleJobs) return true;
    if (table === 'jobs') return this.visibleJobs.has(row.id);
    if (row.job_id) return this.visibleJobs.has(row.job_id);
    return true;
  }

  async upsert(table: TableName, row: BaseRow) {
    if (!this.online) throw new RemoteError('network', 'Failed to fetch');
    if (this.rejectIds.has(row.id)) throw new RemoteError('rejected', 'nope');
    this.upserts.push(row.id);
    return this.put(table, { ...row, server_seen: true });
  }

  async pull(table: TableName, after: Cursor | null, limit: number, jobId?: string) {
    if (!this.online) throw new RemoteError('network', 'Failed to fetch');
    return Array.from(this.t(table).values())
      .filter((r) => this.visible(table, r))
      .filter((r) => !jobId || (r as BaseRow & { job_id?: string }).job_id === jobId)
      .filter(
        (r) => !after || r.updated_at! > after.ts || (r.updated_at === after.ts && r.id > after.id),
      )
      .sort((a, b) => (a.updated_at! < b.updated_at! ? -1 : a.updated_at! > b.updated_at! ? 1 : a.id < b.id ? -1 : 1))
      .slice(0, limit);
  }

  async listJobIds() {
    if (!this.online) throw new RemoteError('network', 'Failed to fetch');
    return Array.from(this.t('jobs').values())
      .filter((r) => this.visible('jobs', r) && !r.deleted_at)
      .map((r) => r.id);
  }
}

async function setup() {
  const storage = new MemoryStorage();
  const store = new LocalStore(storage, 'hk:user1');
  await store.load();
  const server = new FakeServer();
  const engine = new SyncEngine(store, server);
  return { storage, store, server, engine };
}

const entry = (id: string, hours: number) => ({
  id,
  job_id: 'job1',
  task_id: 'task1',
  user_id: 'user1',
  work_date: '2026-10-16',
  hours,
  note: '',
  edited: false,
});

describe('offline writes', () => {
  it('keeps changes queued while offline and sends them when back online', async () => {
    const { store, server, engine } = await setup();
    server.online = false;
    await store.write('time_entries', entry('e1', 4));
    expect(store.all('time_entries')).toHaveLength(1);
    expect(engine.getState().pending).toBe(1);

    await engine.sync();
    expect(engine.getState().phase).toBe('offline');
    expect(engine.getState().pending).toBe(1);

    server.online = true;
    await engine.sync();
    expect(engine.getState().phase).toBe('idle');
    expect(engine.getState().pending).toBe(0);
    expect(server.tables.get('time_entries')!.get('e1')).toMatchObject({ hours: 4 });
    // The server's version (with server-set fields) replaces the local one
    expect(store.get<BaseRow & { server_seen?: boolean }>('time_entries', 'e1')!.server_seen).toBe(true);
  });

  it('survives the app being closed before syncing', async () => {
    const { storage, store } = await setup();
    await store.write('time_entries', entry('e1', 4));

    const reopened = new LocalStore(storage, 'hk:user1');
    await reopened.load();
    expect(reopened.pendingCount()).toBe(1);
    expect(reopened.get('time_entries', 'e1')).toMatchObject({ hours: 4 });
  });

  it('keeps each user’s data separate on a shared device', async () => {
    const { storage, store } = await setup();
    await store.write('time_entries', entry('e1', 4));
    const other = new LocalStore(storage, 'hk:user2');
    await other.load();
    expect(other.all('time_entries')).toHaveLength(0);
    expect(other.pendingCount()).toBe(0);
  });

  it('collapses repeated edits to one row into a single change', async () => {
    const { store, server, engine } = await setup();
    await store.write('time_entries', entry('e1', 4));
    await store.write('time_entries', entry('e1', 5));
    await store.write('time_entries', entry('e1', 6));
    expect(store.pendingCount()).toBe(1);
    await engine.sync();
    expect(server.upserts).toEqual(['e1']);
    expect(server.tables.get('time_entries')!.get('e1')).toMatchObject({ hours: 6 });
  });

  it('does not lose an edit made while that row is being sent', async () => {
    const { store, server, engine } = await setup();
    await store.write('time_entries', entry('e1', 4));

    const realUpsert = server.upsert.bind(server);
    server.upsert = async (table, row) => {
      server.upsert = realUpsert; // only intercept the first send
      await store.write('time_entries', entry('e1', 7)); // user edits mid-send
      return realUpsert(table, row);
    };
    await engine.sync();
    expect(store.get('time_entries', 'e1')).toMatchObject({ hours: 7 });
    expect(server.tables.get('time_entries')!.get('e1')).toMatchObject({ hours: 7 });
    expect(store.pendingCount()).toBe(0);
  });

  it('a refused change does not block the others, and can be discarded', async () => {
    const { store, server, engine } = await setup();
    server.rejectIds.add('bad');
    await store.write('time_entries', entry('bad', 4));
    await store.write('time_entries', entry('good', 2));
    await engine.sync();

    expect(server.tables.get('time_entries')!.has('good')).toBe(true);
    expect(engine.getState().pending).toBe(0);
    expect(engine.getState().rejected).toBe(1);
    const [rejected] = store.rejectedItems();
    expect(rejected.rejected).toBe('nope');

    await store.discard(rejected.seq);
    expect(store.get('time_entries', 'bad')).toBeUndefined();
    expect(engine.getState().rejected).toBe(0);
  });
});

describe('saving a whole job at once', () => {
  it('queues rows in order and sends parents first', async () => {
    const { store, server, engine } = await setup();
    await store.writeMany([
      { table: 'jobs', row: { id: 'j1', name: 'Job' } as BaseRow },
      { table: 'phases', row: { id: 'p1', job_id: 'j1', name: 'Site setup' } as BaseRow },
      { table: 'tasks', row: { id: 't1', job_id: 'j1', phase_id: 'p1', name: 'Induction' } as BaseRow },
      { table: 'tasks', row: { id: 't2', job_id: 'j1', phase_id: 'p1', name: 'Plumbing' } as BaseRow },
    ]);
    expect(store.pendingCount()).toBe(4);
    expect(store.all('tasks')).toHaveLength(2);
    await engine.sync();
    expect(server.upserts).toEqual(['j1', 'p1', 't1', 't2']);
    expect(store.pendingCount()).toBe(0);
  });
});

describe('pulling from the server', () => {
  it('fetches every page of a large table', async () => {
    const { store, server, engine } = await setup();
    const at = Date.parse('2026-10-02T00:00:00Z');
    // 1,200 rows sharing one timestamp — paging must not loop or skip
    for (let i = 0; i < 1200; i++) {
      server.put('tasks', { id: `t${String(i).padStart(4, '0')}`, job_id: 'j', name: `Task ${i}` }, at);
    }
    await engine.sync();
    expect(store.all('tasks')).toHaveLength(1200);
  });

  it('only fetches what changed since last time (plus a short safety overlap)', async () => {
    const { store, server, engine } = await setup();
    server.put('templates', { id: 'old', name: 'Old' });
    server.clock += 10 * 60 * 1000;
    server.put('templates', { id: 'a', name: 'A' }); // last row seen — inside the re-read window
    await engine.sync();
    server.clock += 10 * 60 * 1000;
    server.put('templates', { id: 'b', name: 'B' });

    const pulled: BaseRow[] = [];
    const realPull = server.pull.bind(server);
    server.pull = async (t, after, limit, jobId) => {
      const rows = await realPull(t, after, limit, jobId);
      if (t === 'templates') pulled.push(...rows);
      return rows;
    };
    await engine.sync();
    expect(pulled.map((r) => r.id)).toEqual(['a', 'b']);
    expect(store.all('templates')).toHaveLength(3);
  });

  it('never overwrites a local change that has not been sent yet', async () => {
    const { store, server, engine } = await setup();
    server.put('time_entries', entry('e1', 4));
    await engine.sync();
    server.online = false;
    await store.write('time_entries', entry('e1', 9));
    server.online = true;
    // Someone else's change arrives in the same run as ours is being sent
    server.rejectIds.add('e1');
    server.put('time_entries', entry('e1', 1));
    await engine.sync();
    expect(store.get('time_entries', 'e1')).toMatchObject({ hours: 9 });
  });

  it('hides rows deleted on the server', async () => {
    const { store, server, engine } = await setup();
    server.put('tasks', { id: 't1', job_id: 'j', name: 'X' });
    await engine.sync();
    expect(store.all('tasks')).toHaveLength(1);
    server.put('tasks', { id: 't1', job_id: 'j', name: 'X', deleted_at: '2026-10-03T00:00:00Z' });
    await engine.sync();
    expect(store.all('tasks')).toHaveLength(0);
  });
});

describe('job assignment', () => {
  it('downloads a whole job when a tech is newly assigned to it', async () => {
    const { store, server, engine } = await setup();
    server.visibleJobs = new Set(['j1']);
    server.put('jobs', { id: 'j1', name: 'Job 1' });
    server.put('jobs', { id: 'j2', name: 'Job 2' });
    // j2's tasks were set up long ago
    server.put('tasks', { id: 'old-task', job_id: 'j2', name: 'Old' });
    server.put('tasks', { id: 'j1-task', job_id: 'j1', name: 'Mine' });
    await engine.sync();
    expect(store.all('jobs').map((j) => j.id)).toEqual(['j1']);
    expect(store.all('tasks').map((t) => t.id)).toEqual(['j1-task']);

    // Much later the tech is added to j2 — its tasks are older than our cursor
    server.clock += 60 * 60 * 1000;
    server.visibleJobs.add('j2');
    server.put('jobs', { id: 'j2', name: 'Job 2' }); // job row touched on release
    await engine.sync();
    expect(store.all('tasks').map((t) => t.id).sort()).toEqual(['j1-task', 'old-task']);
  });

  it('removes a job from the device when the tech is taken off it', async () => {
    const { store, server, engine } = await setup();
    server.visibleJobs = new Set(['j1', 'j2']);
    server.put('jobs', { id: 'j1', name: 'Job 1' });
    server.put('jobs', { id: 'j2', name: 'Job 2' });
    server.put('tasks', { id: 't2', job_id: 'j2', name: 'T' });
    await engine.sync();
    expect(store.all('jobs')).toHaveLength(2);

    server.visibleJobs.delete('j2');
    await engine.sync();
    expect(store.all('jobs').map((j) => j.id)).toEqual(['j1']);
    expect(store.all('tasks')).toHaveLength(0);
  });

  it('removes the job even if a refused change for it is still listed', async () => {
    const { store, server, engine } = await setup();
    server.visibleJobs = new Set(['j1']);
    server.put('jobs', { id: 'j1', name: 'Job 1' });
    await engine.sync();
    server.rejectIds.add('j1');
    await store.write('jobs', { id: 'j1', name: 'Renamed' });
    await engine.sync();
    expect(store.rejectedItems()).toHaveLength(1);

    server.visibleJobs.delete('j1');
    await engine.sync();
    expect(store.all('jobs')).toHaveLength(0);
    expect(store.rejectedItems()).toHaveLength(1); // still shown for review
  });
});

describe('sync runs', () => {
  it('never runs two syncs at once', async () => {
    const { store, server, engine } = await setup();
    let concurrent = 0;
    let maxConcurrent = 0;
    const realPull = server.pull.bind(server);
    server.pull = async (...args) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 1));
      concurrent--;
      return realPull(...args);
    };
    await store.write('time_entries', entry('e1', 1));
    await Promise.all([engine.sync(), engine.sync(), engine.sync()]);
    expect(maxConcurrent).toBe(1);
    expect(engine.getState().pending).toBe(0);
  });

  it('reports a signed-out session', async () => {
    const { server, engine } = await setup();
    server.pull = async () => {
      throw new RemoteError('auth', 'JWT expired');
    };
    await engine.sync();
    expect(engine.getState().phase).toBe('signed-out');
  });
});

describe('files before rows', () => {
  const att = { id: 'a1', job_id: 'job1', task_id: 'task1', time_entry_id: null, user_id: 'user1', storage_path: 'job1/a1/p.jpg', file_name: 'p.jpg', mime_type: 'image/jpeg', size_bytes: 10 };

  it('runs the upload hook before the row and waits when the upload has no signal', async () => {
    const storage = new MemoryStorage();
    const store = new LocalStore(storage, 'hk:user1');
    await store.load();
    const server = new FakeServer();
    const order: string[] = [];
    let uploadOnline = false;
    const engine = new SyncEngine(store, server, {
      beforePush: async (item) => {
        if (item.table !== 'attachments') return;
        if (!uploadOnline) throw new RemoteError('network', 'Failed to fetch');
        order.push('file');
      },
    });
    const realUpsert = server.upsert.bind(server);
    server.upsert = async (t, r) => {
      order.push(`row:${t}`);
      return realUpsert(t, r);
    };
    await store.write('attachments', att);
    await engine.sync();
    expect(engine.getState().phase).toBe('offline');
    expect(server.tables.get('attachments')?.get('a1')).toBeUndefined();
    expect(engine.getState().pending).toBe(1);

    uploadOnline = true;
    await engine.sync();
    expect(order).toEqual(['file', 'row:attachments']);
    expect(engine.getState().pending).toBe(0);
  });

  it('marks the change not saved when the file can’t be sent, and carries on', async () => {
    const storage = new MemoryStorage();
    const store = new LocalStore(storage, 'hk:user1');
    await store.load();
    const server = new FakeServer();
    const engine = new SyncEngine(store, server, {
      beforePush: async (item) => {
        if (item.table === 'attachments') throw new RemoteError('rejected', 'file missing');
      },
    });
    await store.write('attachments', att);
    await store.write('time_entries', entry('e1', 2));
    await engine.sync();
    expect(engine.getState().rejected).toBe(1);
    expect(server.tables.get('time_entries')!.get('e1')).toBeDefined();
  });
});

describe('parseTs', () => {
  it('reads Postgres timestamps with microseconds', () => {
    expect(parseTs('2026-10-17T00:19:11.098123+00:00')).toBe(Date.parse('2026-10-17T00:19:11.098Z'));
    expect(parseTs('2026-10-17T00:19:11+00:00')).toBe(Date.parse('2026-10-17T00:19:11Z'));
    expect(parseTs('2026-10-17T00:19:11.5Z')).toBe(Date.parse('2026-10-17T00:19:11.500Z'));
  });
});
