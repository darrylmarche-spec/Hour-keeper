import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, CommandBar, EmptyState, goBackOrHome, Notice, Pill } from '@/components/ui';
import { useMe, useRow, useTable } from '@/data/DataProvider';
import { Task } from '@/data/schema';
import { formatHours, HourTotals, jobTotals, percentUsed, quotedMismatch, variance } from '@/data/totals';
import { managesJobs, seesPercentages, STATUS_LABELS } from '@/lib/roles';
import Colors, { Fonts } from '@/theme/colors';

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe()!;
  const job = useRow('jobs', id);
  const allPhases = useTable('phases');
  const allTasks = useTable('tasks');
  const allEntries = useTable('time_entries');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { phases, tasksByPhase, totals } = useMemo(() => {
    const phases = allPhases.filter((p) => p.job_id === id).sort((a, b) => a.sort_order - b.sort_order);
    const tasks = allTasks.filter((t) => t.job_id === id).sort((a, b) => a.sort_order - b.sort_order);
    const entries = allEntries.filter((e) => e.job_id === id);
    const tasksByPhase = new Map<string, Task[]>();
    for (const t of tasks) tasksByPhase.set(t.phase_id, [...(tasksByPhase.get(t.phase_id) ?? []), t]);
    return { phases, tasksByPhase, totals: jobTotals(phases, tasks, entries) };
  }, [allPhases, allTasks, allEntries, id]);

  if (!job) {
    return (
      <View style={styles.screen}>
        <CommandBar title="Job" back />
        <EmptyState
          icon="search-outline"
          title="Job not found"
          message="It may have been removed, or you're no longer assigned to it."
        >
          <Button title="Back to jobs" onPress={goBackOrHome} style={{ minWidth: 220 }} />
        </EmptyState>
      </View>
    );
  }

  const showPct = seesPercentages(me.role);
  const toggle = (pid: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid);
      else n.add(pid);
      return n;
    });

  return (
    <View style={styles.screen}>
      <CommandBar
        title={job.name}
        subtitle={[job.job_number, STATUS_LABELS[job.status]].filter(Boolean).join(' · ')}
        back="Jobs"
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.summary}>
          <Stat label="Sold" value={formatHours(totals.sold)} />
          <Stat label="Actual" value={formatHours(totals.actual)} />
          <Stat
            label={variance(totals) > 0 ? 'Over' : 'Remaining'}
            value={formatHours(Math.abs(variance(totals)))}
            tone={variance(totals) > 0 ? 'bad' : 'ok'}
          />
          {showPct ? <Stat label="Used" value={pctText(totals)} tone={variance(totals) > 0 ? 'bad' : undefined} /> : null}
        </View>

        <View style={styles.notices}>
          {managesJobs(me.role) && quotedMismatch(job.quoted_total_hours, totals.sold) ? (
            <Notice tone="warn">
              The sheet total ({formatHours(job.quoted_total_hours!)} hrs) doesn’t match the task lines (
              {formatHours(totals.sold)} hrs). Reports use the task lines.
            </Notice>
          ) : null}
          {job.deadline ? <Pill text={`Due ${job.deadline}`} /> : null}
        </View>

        {phases.map((p) => {
          const pt = totals.byPhase.get(p.id)!;
          const open = !collapsed.has(p.id);
          return (
            <View key={p.id}>
              <Pressable
                onPress={() => toggle(p.id)}
                style={styles.phaseBar}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
              >
                <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={Colors.textSecondary} />
                <Text style={styles.phaseTitle}>{p.name}</Text>
                <Text style={[styles.phaseHours, pt.actual > pt.sold && { color: Colors.danger }]}>
                  {formatHours(pt.actual)} / {formatHours(pt.sold)}
                  {showPct && percentUsed(pt) !== null ? `  ·  ${percentUsed(pt)}%` : ''}
                </Text>
              </Pressable>
              {open
                ? (tasksByPhase.get(p.id) ?? []).map((t) => (
                    <TaskRow key={t.id} task={t} totals={totals.byTask.get(t.id)!} showPct={showPct} />
                  ))
                : null}
            </View>
          );
        })}

        <Text style={styles.footnote}>Hours shown are actual / sold.</Text>
      </ScrollView>
    </View>
  );
}

function pctText(t: HourTotals) {
  const p = percentUsed(t);
  return p === null ? '—' : `${p}%`;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          tone === 'bad' && { color: Colors.danger },
          tone === 'ok' && { color: Colors.successDark },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function TaskRow({ task, totals, showPct }: { task: Task; totals: HourTotals; showPct: boolean }) {
  const over = totals.actual > totals.sold;
  const extra = task.kind !== 'planned';
  return (
    <View style={styles.task}>
      <Text style={styles.lineNo}>{task.line_no}</Text>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={styles.taskName}>{task.name}</Text>
        {extra ? <Pill text={task.kind === 'extra_productive' ? 'Extra · productive' : 'Extra · non-productive'} tone="warn" /> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.taskHours, over && { color: Colors.danger }]}>
          {formatHours(totals.actual)} / {formatHours(totals.sold)}
        </Text>
        {showPct && percentUsed(totals) !== null ? (
          <Text style={[styles.taskPct, over && { color: Colors.danger }]}>{percentUsed(totals)}%</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  summary: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  stat: { flex: 1, paddingVertical: 14, alignItems: 'center', gap: 2 },
  statLabel: {
    fontFamily: Fonts.semibold,
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: { fontFamily: Fonts.bold, fontSize: 24, color: Colors.text },
  notices: { padding: 12, gap: 8 },
  phaseBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.sectionBar,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  phaseTitle: { flex: 1, fontFamily: Fonts.bold, fontSize: 13, color: Colors.text, textTransform: 'uppercase', letterSpacing: 0.4 },
  phaseHours: { fontFamily: Fonts.bold, fontSize: 13, color: Colors.textSecondary },
  task: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  lineNo: { width: 26, fontFamily: Fonts.bold, fontSize: 13, color: Colors.textTertiary, textAlign: 'right' },
  taskName: { fontFamily: Fonts.medium, fontSize: 15, color: Colors.text },
  taskHours: { fontFamily: Fonts.bold, fontSize: 15, color: Colors.text },
  taskPct: { fontFamily: Fonts.semibold, fontSize: 12, color: Colors.successDark },
  footnote: { fontFamily: Fonts.regular, fontSize: 12.5, color: Colors.textTertiary, textAlign: 'center', marginTop: 16 },
});
