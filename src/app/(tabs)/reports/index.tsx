import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { CommandBar, EmptyState, SectionBar } from '@/components/ui';
import { useBudgets, useMe, useTable } from '@/data/DataProvider';
import { formatHours } from '@/data/totals';
import { seesAllJobs, seesPercentages, seesSoldHours } from '@/lib/roles';
import { compareJobs } from '@/reports/compare';
import Colors, { Fonts } from '@/theme/colors';

// Every job you can see that has gone to the field. Tap one for its report.
export default function ReportsScreen() {
  const me = useMe()!;
  const jobs = useTable('jobs');
  const members = useTable('job_members');
  const tasks = useTable('tasks');
  const entries = useTable('time_entries');
  const showPct = seesPercentages(me.role);
  const showSold = seesSoldHours(me.role);
  const { soldByTask } = useBudgets();

  const sections = useMemo(() => {
    const mine = (seesAllJobs(me.role) ? jobs : jobs.filter((j) => members.some((m) => m.job_id === j.id && m.user_id === me.id))).filter(
      (j) => j.status !== 'draft',
    );
    const rows = compareJobs(mine, tasks, entries, soldByTask).jobs;
    const byName = (a: (typeof rows)[number], b: (typeof rows)[number]) => a.job.name.localeCompare(b.job.name);
    return [
      { title: 'Complete', data: rows.filter((r) => r.job.status === 'complete').sort(byName) },
      { title: 'In the field', data: rows.filter((r) => r.job.status === 'released').sort(byName) },
    ].filter((s) => s.data.length);
  }, [jobs, members, tasks, entries, soldByTask, me.id, me.role]);

  return (
    <View style={styles.screen}>
      <CommandBar
        title="Reports"
        subtitle={showSold ? 'Sold vs actual hours' : 'Hours logged'}
        right={
          showPct ? (
            <Pressable
              onPress={() => router.push('/reports/compare')}
              accessibilityRole="button"
              accessibilityLabel="Compare jobs"
              style={({ pressed }) => [styles.pillBtn, pressed && { opacity: 0.8 }]}
            >
              <Ionicons name="git-compare-outline" size={16} color={Colors.primary} />
              <Text style={styles.pillText}>Compare</Text>
            </Pressable>
          ) : undefined
        }
      />
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.job.id}
        renderSectionHeader={({ section }) => <SectionBar title={`${section.title} · ${section.data.length}`} />}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
        renderItem={({ item }) => {
          const over = showSold && item.variance > 0;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/reports/[id]', params: { id: item.job.id } })}
              accessibilityRole="button"
              accessibilityLabel={`Report for ${item.job.name}`}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.surfacePressed }]}
            >
              <Ionicons name="document-text-outline" size={22} color={Colors.textTertiary} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={styles.name} numberOfLines={2}>
                  {item.job.name}
                </Text>
                {item.job.job_number ? <Text style={styles.meta}>{item.job.job_number}</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.hours, over && { color: Colors.danger }]}>
                  {showSold ? `${formatHours(item.actual)} / ${formatHours(item.sold)}` : formatHours(item.actual)}
                </Text>
                <Text style={[styles.sub, over && { color: Colors.danger }]}>
                  {!showSold
                    ? 'hrs logged'
                    : showPct && item.pct !== null
                      ? `${item.pct}% used`
                      : over
                        ? `${formatHours(item.variance)} over`
                        : `${formatHours(-item.variance)} left`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="bar-chart-outline"
            title="No reports yet"
            message="Once a job is released to the field, its report shows here — with Share and Save PDF."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  pillBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.field, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  pillText: { fontFamily: Fonts.bold, fontSize: 13, color: Colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  name: { fontFamily: Fonts.semibold, fontSize: 16, color: Colors.text },
  meta: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.textSecondary },
  hours: { fontFamily: Fonts.bold, fontSize: 16, color: Colors.text },
  sub: { fontFamily: Fonts.semibold, fontSize: 12, color: Colors.successDark },
});
