import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { JobActions } from '@/components/JobActions';
import { Button, CommandBar, EmptyState, goBackOrHome, Notice, Pill } from '@/components/ui';
import { useBudgets, useMe, useRow, useTable } from '@/data/DataProvider';
import { Task } from '@/data/schema';
import { formatHours, HourTotals, jobTotals, percentUsed, quotedMismatch, variance } from '@/data/totals';
import { managesJobs, seesPercentages, seesSoldHours, STATUS_LABELS } from '@/lib/roles';
import Colors, { Fonts } from '@/theme/colors';

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe()!;
  const job = useRow('jobs', id);
  const allPhases = useTable('phases');
  const allTasks = useTable('tasks');
  const allEntries = useTable('time_entries');
  const allComments = useTable('comments');
  const allAttachments = useTable('attachments');
  const { soldByTask, quotedByJob } = useBudgets();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { phases, tasksByPhase, totals, extras } = useMemo(() => {
    const phases = allPhases.filter((p) => p.job_id === id).sort((a, b) => a.sort_order - b.sort_order);
    const tasks = allTasks.filter((t) => t.job_id === id).sort((a, b) => a.sort_order - b.sort_order);
    const entries = allEntries.filter((e) => e.job_id === id);
    const tasksByPhase = new Map<string, Task[]>();
    for (const t of tasks) tasksByPhase.set(t.phase_id, [...(tasksByPhase.get(t.phase_id) ?? []), t]);
    // Notes and photos per task, shown as small counts on each row.
    const extras = new Map<string, number>();
    for (const r of [...allComments, ...allAttachments]) {
      if (r.job_id === id && r.task_id) extras.set(r.task_id, (extras.get(r.task_id) ?? 0) + 1);
    }
    return { phases, tasksByPhase, totals: jobTotals(phases, tasks, entries, soldByTask), extras };
  }, [allPhases, allTasks, allEntries, allComments, allAttachments, soldByTask, id]);

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
  const showSold = seesSoldHours(me.role);
  const quoted = quotedByJob.get(job.id) ?? null;
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
          {showSold ? <Stat label="Sold" value={formatHours(totals.sold)} /> : null}
          <Stat label={showSold ? 'Actual' : 'Hours logged'} value={formatHours(totals.actual)} />
          {showSold ? (
            <Stat
              label={variance(totals) > 0 ? 'Over' : 'Remaining'}
              value={formatHours(Math.abs(variance(totals)))}
              tone={variance(totals) > 0 ? 'bad' : 'ok'}
            />
          ) : null}
          {showPct ? <Stat label="Used" value={pctText(totals)} tone={variance(totals) > 0 ? 'bad' : undefined} /> : null}
        </View>

        {managesJobs(me.role) ? <JobActions job={job} /> : null}

        {job.status !== 'draft' ? (
          <Pressable
            onPress={() => router.push({ pathname: '/job/[id]/report', params: { id: job.id } })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.reportLink, pressed && { backgroundColor: Colors.surfacePressed }]}
          >
            <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
            <Text style={styles.reportText}>{showSold ? 'Sold vs actual report · PDF' : 'Hours report · PDF'}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
          </Pressable>
        ) : null}

        {liftLine(job) ? <Text style={styles.liftLine}>{liftLine(job)}</Text> : null}

        <View style={styles.notices}>
          {managesJobs(me.role) && quotedMismatch(quoted, totals.sold) ? (
            <Notice tone="warn">
              The sheet total ({formatHours(quoted!)} hrs) doesn’t match the task lines (
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
                <Text style={[styles.phaseHours, showSold && pt.actual > pt.sold && { color: Colors.danger }]}>
                  {showSold ? `${formatHours(pt.actual)} / ${formatHours(pt.sold)}` : formatHours(pt.actual)}
                  {showPct && percentUsed(pt) !== null ? `  ·  ${percentUsed(pt)}%` : ''}
                </Text>
              </Pressable>
              {open
                ? (tasksByPhase.get(p.id) ?? []).map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      totals={totals.byTask.get(t.id)!}
                      showPct={showPct}
                      showSold={showSold}
                      extras={extras.get(t.id) ?? 0}
                      onPress={() => router.push({ pathname: '/job/[id]/task/[taskId]', params: { id: job.id, taskId: t.id } })}
                    />
                  ))
                : null}
            </View>
          );
        })}

        <Text style={styles.footnote}>
          {showSold ? 'Hours shown are actual / sold. ' : 'Hours shown are what has been logged. '}Tap a task to log hours, add notes or photos.
        </Text>
      </ScrollView>
    </View>
  );
}

function liftLine(job: { stops?: number | null; travel_height_m?: number | null; quotation_number?: string; site_address: string; customer: string }) {
  return [
    job.stops ? `${job.stops} stops` : '',
    job.travel_height_m ? `${formatHours(Number(job.travel_height_m))} m travel` : '',
    job.quotation_number ? `Quote ${job.quotation_number}` : '',
    job.customer,
    job.site_address,
  ]
    .filter(Boolean)
    .join(' · ');
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

function TaskRow({
  task,
  totals,
  showPct,
  showSold,
  extras,
  onPress,
}: {
  task: Task;
  totals: HourTotals;
  showPct: boolean;
  showSold: boolean;
  extras: number;
  onPress: () => void;
}) {
  const over = showSold && totals.actual > totals.sold;
  const extra = task.kind !== 'planned';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        showSold ? `${task.name}, ${formatHours(totals.actual)} of ${formatHours(totals.sold)} hours` : `${task.name}, ${formatHours(totals.actual)} hours`
      }
      style={({ pressed }) => [styles.task, pressed && { backgroundColor: Colors.surfacePressed }]}
    >
      <Text style={styles.lineNo}>{task.line_no}</Text>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={styles.taskName}>{task.name}</Text>
        <View style={styles.taskTags}>
          {extra ? <Pill text={task.kind === 'extra_productive' ? 'Extra · productive' : 'Extra · non-productive'} tone="warn" /> : null}
          {extras ? (
            <View style={styles.extras}>
              <Ionicons name="chatbubbles-outline" size={13} color={Colors.textTertiary} />
              <Text style={styles.extrasText}>{extras}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.taskHours, over && { color: Colors.danger }]}>
          {showSold ? `${formatHours(totals.actual)} / ${formatHours(totals.sold)}` : formatHours(totals.actual)}
        </Text>
        {showPct && percentUsed(totals) !== null ? (
          <Text style={[styles.taskPct, over && { color: Colors.danger }]}>{percentUsed(totals)}%</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
    </Pressable>
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
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  reportText: { flex: 1, fontFamily: Fonts.semibold, fontSize: 15, color: Colors.primary },
  liftLine: { fontFamily: Fonts.medium, fontSize: 13.5, color: Colors.textSecondary, paddingHorizontal: 12, paddingTop: 12 },
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
  taskTags: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  extras: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  extrasText: { fontFamily: Fonts.semibold, fontSize: 12, color: Colors.textTertiary },
  taskName: { fontFamily: Fonts.medium, fontSize: 15, color: Colors.text },
  taskHours: { fontFamily: Fonts.bold, fontSize: 15, color: Colors.text },
  taskPct: { fontFamily: Fonts.semibold, fontSize: 12, color: Colors.successDark },
  footnote: { fontFamily: Fonts.regular, fontSize: 12.5, color: Colors.textTertiary, textAlign: 'center', marginTop: 16 },
});
