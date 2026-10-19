import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, CommandBar, EmptyState, goBackOrHome, Notice, SectionBar } from '@/components/ui';
import { newId, useData, useMe, useRow, useSave, useTable } from '@/data/DataProvider';
import { JobMember, Profile } from '@/data/schema';
import { confirm } from '@/lib/confirm';
import { managesJobs, ROLE_LABELS } from '@/lib/roles';
import Colors, { Fonts } from '@/theme/colors';

// Choose who works on a job. Techs see the job on their phones once it's
// released; taking someone off removes it from their phone but keeps any
// hours they logged.
export default function TeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe()!;
  const job = useRow('jobs', id);
  const profiles = useTable('profiles');
  const members = useTable('job_members');
  const entries = useTable('time_entries');
  const save = useSave();
  const { store } = useData();

  const { techs, others, onJob } = useMemo(() => {
    const active = profiles.filter((p) => p.active).sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
    const onJob = new Map(members.filter((m) => m.job_id === id).map((m) => [m.user_id, m]));
    return { techs: active.filter((p) => p.role === 'tech'), others: active.filter((p) => p.role !== 'tech'), onJob };
  }, [profiles, members, id]);

  if (!job || !managesJobs(me.role)) {
    return (
      <View style={styles.screen}>
        <CommandBar title="Team" back />
        <EmptyState icon="search-outline" title={job ? 'Only PMs, supervisors and admins can change the team' : 'Job not found'}>
          <Button title="Back" onPress={goBackOrHome} style={{ minWidth: 200 }} />
        </EmptyState>
      </View>
    );
  }

  const assigned = Array.from(onJob.values()).length;

  const toggle = async (p: Profile) => {
    const m = onJob.get(p.id);
    if (m) {
      const logged = entries.filter((e) => e.job_id === job.id && e.user_id === p.id).reduce((s, e) => s + Number(e.hours), 0);
      const ok = await confirm(
        `Take ${p.full_name || p.email} off this job?`,
        logged
          ? `The job leaves their phone. The ${logged} hours they’ve logged stay in the reports.`
          : 'The job leaves their phone at the next sync.',
        'Take off job',
      );
      if (!ok) return;
      await save('job_members', { ...m, deleted_at: new Date().toISOString() });
    } else {
      // Re-use the earlier assignment if they were on this job before.
      const old = store.findAny<JobMember>('job_members', (x) => x.job_id === job.id && x.user_id === p.id);
      await save('job_members', old ? { ...old, deleted_at: null } : { id: newId(), job_id: job.id, user_id: p.id });
    }
  };

  return (
    <View style={styles.screen}>
      <CommandBar title="Team" subtitle={`${job.name} · ${assigned} assigned`} back />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {job.status === 'draft' ? (
          <View style={styles.pad}>
            <Notice tone="warn">This job is still a draft. Techs will see it once you release it to the field.</Notice>
          </View>
        ) : null}
        <SectionBar title={`Field techs · ${techs.length}`} />
        {techs.length ? (
          techs.map((p) => <PersonRow key={p.id} person={p} on={onJob.has(p.id)} onPress={() => void toggle(p)} />)
        ) : (
          <Text style={styles.empty}>No approved field techs yet. Approve accounts in the Admin tab.</Text>
        )}
        {others.length ? (
          <>
            <SectionBar title="Others" />
            {others.map((p) => (
              <PersonRow key={p.id} person={p} on={onJob.has(p.id)} onPress={() => void toggle(p)} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function PersonRow({ person, on, onPress }: { person: Profile; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={person.full_name || person.email}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.surfacePressed }]}
    >
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={26} color={on ? Colors.selected : Colors.textTertiary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{person.full_name || person.email}</Text>
        <Text style={styles.meta}>
          {ROLE_LABELS[person.role]} · {person.email}
        </Text>
      </View>
      {on ? <Text style={styles.onJob}>On job</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  pad: { padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  name: { fontFamily: Fonts.semibold, fontSize: 16, color: Colors.text },
  meta: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.textSecondary },
  onJob: { fontFamily: Fonts.bold, fontSize: 12, color: Colors.selected, textTransform: 'uppercase' },
  empty: { padding: 16, fontFamily: Fonts.regular, fontSize: 14, color: Colors.textSecondary },
});
