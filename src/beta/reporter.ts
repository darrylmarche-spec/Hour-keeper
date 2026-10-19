// The app's one problem reporter, and the hooks that catch errors nothing
// else handled.

import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { ErrorReporter } from './errorReports';

export const reporter = new ErrorReporter(() => Crypto.randomUUID());

let installed = false;

export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (e) => reporter.report(e.error ?? e.message));
    window.addEventListener('unhandledrejection', (e) => reporter.report(e.reason));
    return;
  }
  const g = globalThis as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } };
  const eu = g.ErrorUtils;
  if (!eu) return;
  const previous = eu.getGlobalHandler();
  eu.setGlobalHandler((e, fatal) => {
    reporter.report(e);
    previous(e, fatal);
  });
}
