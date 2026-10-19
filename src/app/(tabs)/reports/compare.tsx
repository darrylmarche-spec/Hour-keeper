import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, CommandBar, EmptyState, goBackOrHome, SectionBar } from '@/components/ui';
import { useMe, useTable } from '@/data/DataProvider';
import { formatHours } from '@/data/totals';
import { seesPercentages } from '@/lib/roles';
import { compareJobs } from '@/reports/compare';
import Colors, { Fonts } from '@/theme/colors';

type Filter = 'all' | 'complete' | 'released';
const FILTERS: [Filter, string][] = [
  ['all', 'All jobs'],
  ['complete', 'Complete'],
  ['released', 'In the field'],
];

// PMs: jobs side by side, and the tasks that run over again and again.
export default function CompareScreen() {
  const me = useMe()!;
  const jobs = useTable('jobs');
  const tasks = useTable('tasks');
  const entries = useTable('time_entries');
  const [filter, setFilter] = useState<Filter>('all');

  const result = useMemo(
    () => compareJobs(jobs.filter((j) => j.status !== 'draft' && (filter === 'all' || j.status === filter)), tasks, entries),
    [jobs, tasks, entries, filter],
  );

  if (!seesPercentages(me.role)) {
    return (
      <View style={styles.screen}>
        <CommandBar title="Compare jobs" back />
        <EmptyState icon="lock-closed-outline" title="Job comparison is for project managers">
          <Button title="Back" onPress={goBackOrHome} style={{ minWidth: 200 }} />
        </EmptyState>
      </View>
    );
  }

  const repeat = result.tasks.filter((t) => t.jobs >= 2);

  return (
    <View style={styles.screen}>
      <CommandBar title="Compare jobs" subtitle={`${result.jobs.length} jobs · ${result.totals.pct ?? 0}% of sold hours used`} back />
      <View style={styles.filters}>
        {FILTERS.map(([f, label]) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f }}
            style={[styles.chip, filter === f && styles.chipOn]}
          >
            <Text style={[styles.chipText, filter === f && { color: Colors.textOnDark }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <SectionBar title="Jobs · most over first" />
        {result.jobs.length ? (
          result.jobs.map((r) => {
            const over = r.variance > 0;
            return (
              <Pressable
                key={r.job.id}
                onPress={() => router.push({ pathname: '/reports/[id]', params: { id: r.job.id } })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.surfacePressed }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={2}>
                    {r.job.name}
                  </Text>
                  <Text style={styles.meta}>
                    {formatHours(r.actual)} of {formatHours(r.sold)} hrs · {over ? `${formatHours(r.variance)} over` : `${formatHours(-r.variance)} under`}
                  </Text>
                </View>
                <Bar pct={r.pct} />
              </Pressable>
            );
          })
        ) : (
          <Text style={styles.empty}>No jobs match.</Text>
        )}

        <SectionBar title="Tasks that repeat across jobs" />
        <Text style={styles.help}>The same line on two or more jobs that has hours logged. Biggest over-run first.</Text>
        {repeat.length ? (
          repeat.slice(0, 30).map((t) => {
            const over = t.variance > 0;
            return (
              <View key={t.key} style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name}>
                    <Text style={styles.lineNo}>{t.line_no}  </Text>
                    {t.name}
                  </Text>
                  <Text style={[styles.meta, t.overOn > 0 && { color: Colors.danger }]}>
                    Over on {t.overOn} of {t.jobs} jobs · {formatHours(t.actual)} of {formatHours(t.sold)} hrs
                    {over ? ` (+${formatHours(t.variance)})` : ''}
                  </Text>
                </View>
                <Bar pct={t.pct} />
              </View>
            );
          })
        ) : (
          <Text style={styles.empty}>Shows once the same task has hours on at least two jobs.</Text>
        )}
      </ScrollView>
    </View>
  );
}

// A small used-vs-sold bar with the percentage.
function Bar({ pct }: { pct: number | null }) {
  const over = pct !== null && pct > 100;
  return (
    <View style={styles.barWrap} accessibilityLabel={pct === null ? 'No sold hours' : `${pct} percent used`}>
      <Text style={[styles.pct, over && { color: Colors.danger }]}>{pct === null ? '—' : `${pct}%`}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(pct ?? 0, 100)}%` }, over && { backgroundColor: Colors.danger }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  filters: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: Colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: Colors.border },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: Colors.borderStrong, backgroundColor: Colors.field, justifyContent: 'center' },
  chipOn: { backgroundColor: Colors.selected, borderColor: Colors.selected },
  chipText: { fontFamily: Fonts.semibold, fontSize: 14, color: Colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  name: { fontFamily: Fonts.semibold, fontSize: 15, color: Colors.text },
  lineNo: { fontFamily: Fonts.bold, color: Colors.textTertiary },
  meta: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  help: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, fontFamily: Fonts.regular, fontSize: 12.5, color: Colors.textSecondary },
  empty: { padding: 16, fontFamily: Fonts.regular, fontSize: 14, color: Colors.textSecondary },
  barWrap: { width: 76, alignItems: 'flex-end', gap: 4 },
  pct: { fontFamily: Fonts.bold, fontSize: 15, color: Colors.successDark },
  track: { width: 76, height: 6, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: Colors.success },
});
