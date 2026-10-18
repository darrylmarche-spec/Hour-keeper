import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, CommandBar, EmptyState, Pill, SectionBar } from '@/components/ui';
import { useMe, useSave, useTable } from '@/data/DataProvider';
import { Profile, Role } from '@/data/schema';
import { confirm } from '@/lib/confirm';
import { ROLE_LABELS } from '@/lib/roles';
import Colors, { Fonts } from '@/theme/colors';

const ROLES: Role[] = ['tech', 'supervisor', 'pm', 'admin'];

export default function AdminScreen() {
  const me = useMe()!;
  const profiles = useTable('profiles');
  const save = useSave();

  const { waiting, active, off } = useMemo(() => {
    const byName = (a: Profile, b: Profile) => (a.full_name || a.email).localeCompare(b.full_name || b.email);
    const sorted = [...profiles].sort(byName);
    return {
      waiting: sorted.filter((p) => !p.active && !p.approved_at),
      active: sorted.filter((p) => p.active),
      off: sorted.filter((p) => !p.active && p.approved_at),
    };
  }, [profiles]);

  if (me.role !== 'admin') {
    return (
      <View style={styles.screen}>
        <CommandBar title="Admin" />
        <EmptyState icon="lock-closed-outline" title="Admins only" />
      </View>
    );
  }

  const setRole = (p: Profile, role: Role) => save('profiles', { ...p, role });
  const setActive = async (p: Profile, activeNow: boolean) => {
    if (!activeNow) {
      const ok = await confirm(
        `Switch off ${p.full_name || p.email}?`,
        'They will no longer be able to see jobs or log hours. Their past hours stay in reports.',
        'Switch off',
      );
      if (!ok) return;
    }
    await save('profiles', { ...p, active: activeNow });
  };

  return (
    <View style={styles.screen}>
      <CommandBar title="Admin" subtitle="People & roles" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {waiting.length ? (
          <>
            <SectionBar title={`Waiting for approval · ${waiting.length}`} />
            {waiting.map((p) => (
              <PersonCard key={p.id} person={p} onRole={(r) => setRole(p, r)}>
                <Button title="Approve" icon="checkmark" onPress={() => void setActive(p, true)} />
              </PersonCard>
            ))}
          </>
        ) : null}

        <SectionBar title={`Active · ${active.length}`} />
        {active.map((p) => (
          <PersonCard key={p.id} person={p} onRole={p.id === me.id ? undefined : (r) => setRole(p, r)}>
            {p.id === me.id ? (
              <Text style={styles.you}>This is you</Text>
            ) : (
              <Button title="Switch off" variant="danger" onPress={() => void setActive(p, false)} />
            )}
          </PersonCard>
        ))}

        {off.length ? (
          <>
            <SectionBar title={`Switched off · ${off.length}`} />
            {off.map((p) => (
              <PersonCard key={p.id} person={p}>
                <Button title="Switch back on" variant="secondary" onPress={() => void setActive(p, true)} />
              </PersonCard>
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function PersonCard({
  person,
  onRole,
  children,
}: {
  person: Profile;
  onRole?: (r: Role) => void;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={{ gap: 2 }}>
        <Text style={styles.name}>{person.full_name || 'No name yet'}</Text>
        <Text style={styles.email}>{person.email}</Text>
      </View>
      {onRole ? (
        <View style={styles.roles} accessibilityRole="radiogroup">
          {ROLES.map((r) => {
            const on = person.role === r;
            return (
              <Pressable
                key={r}
                onPress={() => !on && onRole(r)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[styles.roleChip, on && styles.roleChipOn]}
              >
                <Text style={[styles.roleText, on && styles.roleTextOn]}>{ROLE_LABELS[r]}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Pill text={ROLE_LABELS[person.role]} tone="dark" />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  card: { padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  name: { fontFamily: Fonts.semibold, fontSize: 16, color: Colors.text },
  email: { fontFamily: Fonts.regular, fontSize: 14, color: Colors.textSecondary },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.field,
  },
  roleChipOn: { backgroundColor: Colors.selected, borderColor: Colors.selected },
  roleText: { fontFamily: Fonts.semibold, fontSize: 14, color: Colors.text },
  roleTextOn: { color: Colors.textOnDark },
  you: { fontFamily: Fonts.medium, fontSize: 13, color: Colors.textTertiary },
});
