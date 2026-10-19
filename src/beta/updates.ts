// Web app updates. The service worker installs a new release in the
// background; when it takes over, the page still runs the old code, so we
// offer a reload. Anything not yet sent is saved on the device, so reloading
// never loses work.

import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

const CHECK_EVERY_MS = 30 * 60 * 1000;

let ready = false;
const listeners = new Set<() => void>();
const setReady = () => {
  ready = true;
  listeners.forEach((fn) => fn());
};

let started = false;

export function startUpdateChecks(): void {
  if (started || Platform.OS !== 'web' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  started = true;
  const sw = navigator.serviceWorker;
  // A page opened before any service worker existed isn't "out of date".
  const hadController = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (hadController) setReady();
  });
  sw.register('/sw.js')
    .then((reg) => {
      const check = () => void reg.update().catch(() => {});
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    })
    .catch(() => {});
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => ready,
    () => false,
  );
}
