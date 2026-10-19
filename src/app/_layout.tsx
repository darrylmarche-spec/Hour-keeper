import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { ErrorBoundaryProps, router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui';
import { DataProvider, useData, useDataMaybe, useMe, useSyncState } from '@/data/DataProvider';
import Colors, { Fonts } from '@/theme/colors';

// Never hold the app back for fonts for longer than this; text shows in the
// phone's own font until Inter arrives.
const FONT_WAIT_MS = 3000;
// After this long on any loading screen, explain and offer a way out.
const STUCK_AFTER_MS = 10000;

// If a screen fails to load or crashes (e.g. no signal before the web app has
// finished saving itself for offline use), show a way out instead of a blank
// page. Saved hours are on the device and aren't affected.
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.splash}>
      <Text style={styles.brand}>This screen didn’t load</Text>
      <Text style={styles.message}>
        Anything you’ve saved is safe on this device. If you’re out of signal, try again once you’re back in range.
      </Text>
      <View style={styles.actions}>
        <Button
          title="Try again"
          icon="refresh"
          onPress={() => {
            // A screen whose download failed is only fetched again on reload.
            if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
            else void retry();
          }}
        />
        <Button
          title="Go to Jobs"
          variant="secondary"
          onPress={() => {
            if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.assign('/');
            else router.replace('/');
          }}
        />
      </View>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [fontWaitOver, setFontWaitOver] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFontWaitOver(true), FONT_WAIT_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Lets the web version open with no signal once it has been visited.
    if (Platform.OS === 'web' && !__DEV__ && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // A slow or failed font download must never trap people on this screen.
  if (!fontsLoaded && !fontError && !fontWaitOver) return <Splash step="Loading fonts" />;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <DataProvider>
          <RootNavigator />
        </DataProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { ready, session } = useAuth();
  const data = useDataMaybe();

  if (!ready) return <Splash step="Checking sign-in" />;
  if (session && !data) return <Splash step="Opening this device's data" />;

  return session ? <SignedIn /> : <Screens signedIn={false} approved={false} />;
}

function SignedIn() {
  const me = useMe();
  const sync = useSyncState();
  const { engine } = useData();
  const { signOut } = useAuth();

  // First sign-in on this device: wait for the first download.
  if (!me) {
    if (sync.phase === 'offline') {
      return (
        <Splash message="This device needs signal once to finish setting up. After that it works offline.">
          <Button title="Try again" icon="refresh" onPress={() => void engine.sync()} />
          <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
        </Splash>
      );
    }
    if (sync.phase === 'idle' && sync.lastSyncedAt) {
      return (
        <Splash message="We couldn't find your account details. Please sign out and in again.">
          <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
        </Splash>
      );
    }
    return <Splash message="Setting up this device…" step="First download" />;
  }

  const approved = me.active;
  return <Screens signedIn approved={approved} />;
}

function Screens({ signedIn, approved }: { signedIn: boolean; approved: boolean }) {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !approved}>
        <Stack.Screen name="pending" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && approved}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="job/new" />
        <Stack.Screen name="job/[id]/index" />
        <Stack.Screen name="job/[id]/edit" />
        <Stack.Screen name="job/[id]/team" />
        <Stack.Screen name="templates" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="sync" />
      </Stack.Protected>
    </Stack>
  );
}

function Splash({ message, step, children }: { message?: string; step?: string; children?: React.ReactNode }) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStuck(true), STUCK_AFTER_MS);
    return () => clearTimeout(t);
  }, []);
  const canReload = Platform.OS === 'web' && typeof window !== 'undefined';

  return (
    <View style={styles.splash}>
      <Text style={styles.brand}>Hour Keeper</Text>
      {message ? <Text style={styles.message}>{message}</Text> : <ActivityIndicator color={Colors.textOnDark} />}
      {children ? <View style={styles.actions}>{children}</View> : null}
      {stuck && !children ? (
        <View style={styles.actions}>
          <Text style={styles.message}>
            Taking longer than usual{step ? ` (${step})` : ''}. Check your signal, then try again.
          </Text>
          {canReload ? <Button title="Reload" icon="refresh" onPress={() => window.location.reload()} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: Colors.chrome, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  brand: { color: Colors.textOnDark, fontSize: 26, fontFamily: Fonts.bold, fontWeight: '700' },
  message: { color: Colors.textOnDarkMuted, fontSize: 16, textAlign: 'center', maxWidth: 340, lineHeight: 22 },
  actions: { width: '100%', maxWidth: 340, gap: 10 },
});
