import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui';
import { DataProvider, useData, useDataMaybe, useMe, useSyncState } from '@/data/DataProvider';
import Colors, { Fonts } from '@/theme/colors';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  useEffect(() => {
    // Lets the web version open with no signal once it has been visited.
    if (Platform.OS === 'web' && !__DEV__ && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  if (!fontsLoaded) return <Splash />;

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

  if (!ready) return <Splash />;
  if (session && !data) return <Splash />;

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
    return <Splash message="Setting up this device…" />;
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
        <Stack.Screen name="job/[id]" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="sync" />
      </Stack.Protected>
    </Stack>
  );
}

function Splash({ message, children }: { message?: string; children?: React.ReactNode }) {
  return (
    <View style={styles.splash}>
      <Text style={styles.brand}>Hour Keeper</Text>
      {message ? <Text style={styles.message}>{message}</Text> : <ActivityIndicator color={Colors.textOnDark} />}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: Colors.chrome, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  brand: { color: Colors.textOnDark, fontSize: 26, fontFamily: Fonts.bold, fontWeight: '700' },
  message: { color: Colors.textOnDarkMuted, fontSize: 16, textAlign: 'center', maxWidth: 340, lineHeight: 22 },
  actions: { width: '100%', maxWidth: 340, gap: 10 },
});
