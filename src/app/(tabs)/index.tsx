import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { CommandBar, EmptyState, Pill, SectionBar } from '@/components/ui';
import { useMe, useTable } from '@/data/DataProvider';
import { Job, JobStatus } from '@/data/schema';
import { formatHours, percentUsed } from '@/data/totals';
import { ROLE_LABELS, seesAllJobs, seesPercentages, STATUS_LABELS } from '@/lib/roles';
import Colors, { Fonts } from '@/theme/colors';

const STATUS_ORDER: JobStatus[] = ['released', 'draft', 'complete'];

export default function JobsScreen() {
  const me = useMe()!;
  const jobs = useTable('jobs');
  const members = useTable('job_members');
  const tasks = useTable('tasks');
  const entries = useTable('time_entries');

  const sections = useMemo(() => {
    const mine = seesAllJobs(me.role)
      ? jobs
      : jobs.filter((j) => members.some((m) => m.job_id === j.id && m.user_id === me.id));

    const sold = new Map<string, number>();
    for (const t of tasks) sold.set(t.job_id, (sold.get(t.job_id) ?? 0) + Number(t.sold_hours));
    const actual = new Map<string, number>();
    for (const e of entries) actual.set(e.job_id, (actual.get(e.job_id) ?? 0) + Number(e.hours));

    return STATUS_ORDER.map((status) => ({
      title: STATUS_LABELS[status],
      data: mine
        .filter((j) => j.status === status)
        .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.name.localeCompare(b.name))
        .map((job) => ({ job, sold: sold.get(job.id) ?? 0, actual: actual.get(job.id) ?? 0 })),
    })).filter((s) => s.data.length);
  }, [jobs, members, tasks, entries, me.id, me.role]);

  return (
    <View style={styles.screen}>
      <CommandBar title="Jobs" subtitle={`${me.full_name || me.email} · ${ROLE_LABELS[me.role]}`} />
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.job.id}
        renderSectionHeader={({ section }) => <SectionBar title={`${section.title} · ${section.data.length}`} />}
        renderItem={({ item }) => (
          <JobRow job={item.job} sold={item.sold} actual={item.actual} showPercent={seesPercentages(me.role)} />
        )}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
        ListEmptyComponent={
          <EmptyState
            icon="briefcase-outline"
            title="No jobs yet"
            message={
              seesAllJobs(me.role)
                ? 'Jobs created by project managers will show here.'
                : 'When a project manager assigns you to a job, it will show here — even offline once it has downloaded.'
            }
          />
        }
      />
    </View>
  );
}

function JobRow({ job, sold, actual, showPercent }: { job: Job; sold: number; actual: number; showPercent: boolean }) {
  const over = actual > sold && sold > 0;
  const pct = percentUsed({ sold, actual });
  const meta = [job.job_number, job.customer, job.site_address].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${job.name}, ${formatHours(actual)} of ${formatHours(sold)} hours`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.surfacePressed }]}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={styles.name} numberOfLines={2}>
          {job.name}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <View style={styles.pills}>
          {job.job_type !== 'construction' ? <Pill text={job.job_type} /> : null}
          {job.deadline ? <Pill text={`Due ${job.deadline}`} /> : null}
        </View>
      </View>
      <View style={styles.hours}>
        <Text style={[styles.actual, over && { color: Colors.danger }]}>{formatHours(actual)}</Text>
        <Text style={styles.sold}>of {formatHours(sold)} hrs</Text>
        {showPercent && pct !== null ? (
          <Text style={[styles.pct, over && { color: Colors.danger }]}>{pct}%</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  name: { fontFamily: Fonts.semibold, fontSize: 16, color: Colors.text },
  meta: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.textSecondary },
  pills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  hours: { alignItems: 'flex-end' },
  actual: { fontFamily: Fonts.bold, fontSize: 20, color: Colors.text },
  sold: { fontFamily: Fonts.medium, fontSize: 12, color: Colors.textSecondary },
  pct: { fontFamily: Fonts.bold, fontSize: 12, color: Colors.successDark, marginTop: 2 },
});
