import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { Button, CommandBar, EmptyState } from '@/components/ui';
import { useData, useMe } from '@/data/DataProvider';
import Colors from '@/theme/colors';

export default function Pending() {
  const me = useMe();
  const { engine } = useData();
  const { signOut } = useAuth();
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    await engine.sync();
    setChecking(false);
  };

  return (
    <View style={styles.screen}>
      <CommandBar title="Hour Keeper" subtitle={me?.email} />
      <EmptyState
        icon="hourglass-outline"
        title="Waiting for approval"
        message={`Thanks${me?.full_name ? `, ${me.full_name.split(' ')[0]}` : ''}. An admin needs to approve your account before you can see jobs.`}
      >
        <View style={styles.actions}>
          <Button title="Check again" icon="refresh" onPress={check} loading={checking} />
          <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
        </View>
      </EmptyState>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  actions: { width: '100%', maxWidth: 320, gap: 10, marginTop: 8 },
});
