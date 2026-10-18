import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { Button, CommandBar, Field, SectionBar } from '@/components/ui';
import { useMe, useSave, useSyncState } from '@/data/DataProvider';
import { confirm } from '@/lib/confirm';
import { ROLE_LABELS } from '@/lib/roles';
import Colors, { Fonts } from '@/theme/colors';

export default function MoreScreen() {
  const me = useMe()!;
  const save = useSave();
  const sync = useSyncState();
  const { signOut } = useAuth();
  const [name, setName] = useState(me.full_name);

  const nameChanged = name.trim() !== me.full_name && name.trim().length > 0;

  const doSignOut = async () => {
    const waiting = sync.pending + sync.rejected;
    if (waiting > 0) {
      const ok = await confirm(
        'Changes not sent yet',
        `${waiting} change${waiting === 1 ? '' : 's'} on this device haven't reached the server. They stay saved on this device and will send next time you sign in here.`,
        'Sign out anyway',
      );
      if (!ok) return;
    }
    await signOut();
  };

  return (
    <View style={styles.screen}>
      <CommandBar title="More" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <SectionBar title="Your account" />
        <View style={styles.block}>
          <Text style={styles.line}>{me.email}</Text>
          <Text style={styles.role}>{ROLE_LABELS[me.role]}</Text>
          <Field label="Name shown on your entries" value={name} onChangeText={setName} autoComplete="name" />
          {nameChanged ? (
            <Button title="Save name" onPress={() => void save('profiles', { ...me, full_name: name.trim() })} />
          ) : null}
        </View>

        <SectionBar title="This device" />
        <Pressable
          style={({ pressed }) => [styles.link, pressed && { backgroundColor: Colors.surfacePressed }]}
          onPress={() => router.push('/sync')}
          accessibilityRole="button"
        >
          <Ionicons name="sync-outline" size={20} color={Colors.text} />
          <Text style={styles.linkText}>Sync & offline status</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </Pressable>

        <View style={styles.block}>
          <Button title="Sign out" variant="danger" icon="log-out-outline" onPress={() => void doSignOut()} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  block: { padding: 16, gap: 12 },
  line: { fontFamily: Fonts.semibold, fontSize: 16, color: Colors.text },
  role: { fontFamily: Fonts.medium, fontSize: 14, color: Colors.textSecondary, marginTop: -8 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  linkText: { flex: 1, fontFamily: Fonts.medium, fontSize: 16, color: Colors.text },
});
