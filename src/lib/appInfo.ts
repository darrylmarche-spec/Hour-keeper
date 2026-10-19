// Which version of the app this is, and on what — attached to feedback and
// problem reports so issues can be matched to a release.

import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
// Set at build time (the git commit on Vercel); "dev" when running locally.
export const BUILD_ID = (process.env.EXPO_PUBLIC_BUILD_ID || 'dev').slice(0, 7);
export const VERSION_LABEL = `${APP_VERSION} (${BUILD_ID})`;

export function deviceLabel(): string {
  if (Platform.OS !== 'web') return `${Platform.OS} ${String(Platform.Version)}`;
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'other';
  const browser = /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : 'browser';
  const standalone =
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
    (navigator as { standalone?: boolean }).standalone;
  return `web · ${os} · ${browser}${standalone ? ' · home screen' : ''}`;
}
