import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { reporter } from '@/beta/reporter';
import { uploadAttachmentFile } from '@/files/attachments';
import { APP_VERSION, BUILD_ID, deviceLabel } from '@/lib/appInfo';
import { supabase } from '@/lib/supabase';
import { LocalStore } from './localStore';
import { SupabaseRemote } from './remote';
import { Attachment, BaseRow, Profile, TableName, Tables } from './schema';
import { SyncEngine, SyncState } from './sync';

interface DataValue {
  store: LocalStore;
  engine: SyncEngine;
}

const DataContext = createContext<DataValue | null>(null);

const BACKGROUND_SYNC_MS = 60_000;
// While offline, check for signal more often so queued work goes out soon
// after it returns.
const OFFLINE_RETRY_MS = 15_000;

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  // Tagged with the user it belongs to, so a stale store is never shown after
  // switching accounts.
  const [loaded, setLoaded] = useState<{ userId: string; value: DataValue } | null>(null);
  const value = loaded && loaded.userId === userId ? loaded.value : null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const store = new LocalStore(AsyncStorage, `hk:${userId}`);
    const engine = new SyncEngine(store, new SupabaseRemote(supabase), {
      // A new attachment's file goes up before its row.
      beforePush: async (item) => {
        if (item.table === 'attachments' && !item.row.updated_at && !item.row.deleted_at) {
          await uploadAttachmentFile(supabase, item.row as Attachment);
        }
      },
    });
    const cleanups: (() => void)[] = [];

    store.load().then(() => {
      if (cancelled) return;
      setLoaded({ userId, value: { store, engine } });
      void engine.sync();

      // Problems the app hits are saved here and go up with the next sync.
      const device = deviceLabel();
      reporter.connect((row) =>
        void store.write('app_errors', { ...row, user_id: userId, app_version: `${APP_VERSION} (${BUILD_ID})`, device }),
      );
      cleanups.push(() => reporter.connect(null));

      // Sync after local changes (debounced), when signal returns, when the
      // app comes back to the foreground, and every minute while open.
      let timer: ReturnType<typeof setTimeout> | null = null;
      let lastPending = store.pendingCount();
      cleanups.push(
        store.subscribe(() => {
          const pending = store.pendingCount();
          if (pending > lastPending) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => void engine.sync(), 800);
          }
          lastPending = pending;
        }),
      );
      let wasConnected: boolean | null = null;
      cleanups.push(
        NetInfo.addEventListener((s) => {
          const connected = !!s.isConnected && s.isInternetReachable !== false;
          if (connected && wasConnected === false) void engine.sync();
          wasConnected = connected;
        }),
      );
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') void engine.sync();
        if (s === 'background') void store.flush();
      });
      cleanups.push(() => sub.remove());
      let lastRun = Date.now();
      const tick = setInterval(() => {
        const wait = engine.getState().phase === 'offline' ? OFFLINE_RETRY_MS : BACKGROUND_SYNC_MS;
        if (Date.now() - lastRun >= wait) {
          lastRun = Date.now();
          void engine.sync();
        }
      }, 5_000);
      cleanups.push(() => clearInterval(tick));
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const online = () => void engine.sync();
        window.addEventListener('online', online);
        cleanups.push(() => window.removeEventListener('online', online));
      }
      cleanups.push(() => {
        if (timer) clearTimeout(timer);
      });
    });

    return () => {
      cancelled = true;
      cleanups.forEach((c) => c());
      void store.flush();
    };
  }, [userId]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataValue {
  const v = useContext(DataContext);
  if (!v) throw new Error('useData used before data was loaded');
  return v;
}

export function useDataMaybe(): DataValue | null {
  return useContext(DataContext);
}

export function useTable<K extends TableName>(table: K): readonly Tables[K][] {
  const { store } = useData();
  return useSyncExternalStore(
    (fn) => store.subscribe(fn),
    () => store.all<Tables[K]>(table),
    () => store.all<Tables[K]>(table),
  );
}

export function useRow<K extends TableName>(table: K, id: string | undefined): Tables[K] | undefined {
  const rows = useTable(table);
  return useMemo(() => (id ? rows.find((r) => r.id === id) : undefined), [rows, id]);
}

export function useSyncState(): SyncState {
  const { engine } = useData();
  return useSyncExternalStore(
    (fn) => engine.subscribe(fn),
    () => engine.getState(),
    () => engine.getState(),
  );
}

// True while a change to this row is still waiting to reach the server.
export function useIsPending(table: TableName, id: string): boolean {
  const { store } = useData();
  return useSyncExternalStore(
    (fn) => store.subscribe(fn),
    () => store.hasUnsent(table, id),
    () => store.hasUnsent(table, id),
  );
}

// Why the server refused a change to this row, or null if nothing was refused.
export function useRejectedReason(table: TableName, id: string): string | null {
  const { store } = useData();
  return useSyncExternalStore(
    (fn) => store.subscribe(fn),
    () => store.rejectedReason(table, id),
    () => store.rejectedReason(table, id),
  );
}

// The sold figures. Only the office's phones ever receive these rows (the
// database sends nothing to anyone else), so for a tech both maps are empty.
export function useBudgets(): { soldByTask: ReadonlyMap<string, number>; quotedByJob: ReadonlyMap<string, number | null> } {
  const taskRows = useTable('task_budgets');
  const jobRows = useTable('job_budgets');
  return useMemo(
    () => ({
      soldByTask: new Map(taskRows.filter((r) => !r.deleted_at).map((r) => [r.id, Number(r.sold_hours)] as const)),
      quotedByJob: new Map(
        jobRows
          .filter((r) => !r.deleted_at)
          .map((r) => [r.id, r.quoted_total_hours === null ? null : Number(r.quoted_total_hours)] as const),
      ),
    }),
    [taskRows, jobRows],
  );
}

export function useMe(): Profile | undefined {
  const { userId } = useAuth();
  return useRow('profiles', userId ?? undefined);
}

export function newId(): string {
  return Crypto.randomUUID();
}

export function useSave() {
  const { store } = useData();
  return <K extends TableName>(table: K, row: Tables[K] & BaseRow) => store.write(table, row);
}

// Save several rows in one go, in order (parents before children).
export function useSaveMany() {
  const { store } = useData();
  return (items: { table: TableName; row: BaseRow }[]) => store.writeMany(items);
}
