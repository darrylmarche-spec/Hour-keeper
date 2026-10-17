import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { LocalStore } from './localStore';
import { SupabaseRemote } from './remote';
import { BaseRow, Profile, TableName, Tables } from './schema';
import { SyncEngine, SyncState } from './sync';

interface DataValue {
  store: LocalStore;
  engine: SyncEngine;
}

const DataContext = createContext<DataValue | null>(null);

const BACKGROUND_SYNC_MS = 60_000;

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
    const engine = new SyncEngine(store, new SupabaseRemote(supabase));
    const cleanups: (() => void)[] = [];

    store.load().then(() => {
      if (cancelled) return;
      setLoaded({ userId, value: { store, engine } });
      void engine.sync();

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
      const interval = setInterval(() => void engine.sync(), BACKGROUND_SYNC_MS);
      cleanups.push(() => clearInterval(interval));
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
