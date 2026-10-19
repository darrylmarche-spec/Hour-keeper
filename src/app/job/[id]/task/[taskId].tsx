import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Attachments } from '@/components/Attachments';
import { Comments } from '@/components/Comments';
import { EntryList } from '@/components/EntryList';
import { LogHoursForm } from '@/components/LogHoursForm';
import { Button, CommandBar, EmptyState, goBackOrHome, Notice, Pill, SectionBar } from '@/components/ui';
import { newId, useMe, useRow, useSave, useTable } from '@/data/DataProvider';
import { formatHours, percentUsed } from '@/data/totals';
import { dayLabel } from '@/logging/dates';
import { canLog, dayTotal } from '@/logging/rules';
import { seesPercentages } from '@/lib/roles';
import Colors, { Fonts } from '@/theme/colors';

// One task: log hours against it, see everyone's hours, notes, photos and files.
export default function TaskScreen() {
  const { id, taskId } = useLocalSearchParams<{ id: string; taskId: string }>();
  const me = useMe()!;
  const job = useRow('jobs', id);
  const task = useRow('tasks', taskId);
  const phase = useRow('phases', task?.phase_id);
  const members = useTable('job_members');
  const allEntries = useTable('time_entries');
  const allComments = useTable('comments');
  const allAttachments = useTable('attachments');
  const save = useSave();
  const [saved, setSaved] = useState<string | null>(null);

  const entries = useMemo(() => allEntries.filter((e) => e.task_id === taskId), [allEntries, taskId]);
  const comments = useMemo(() => allComments.filter((c) => c.task_id === taskId), [allComments, taskId]);
  const attachments = useMemo(() => allAttachments.filter((a) => a.task_id === taskId), [allAttachments, taskId]);

  if (!job || !task || task.job_id !== job.id) {
    return (
      <View style={styles.screen}>
        <CommandBar title="Task" back />
        <EmptyState icon="search-outline" title="Task not found" message="It may have been removed from the job.">
          <Button title="Back" onPress={goBackOrHome} style={{ minWidth: 200 }} />
        </EmptyState>
      </View>
    );
  }

  const access = canLog(job, me, members);
  const actual = entries.reduce((s, e) => s + Math.round(Number(e.hours) * 100), 0) / 100;
  const sold = Number(task.sold_hours);
  const over = actual > sold;
  const pct = percentUsed({ sold, actual });
  const mine = entries.filter((e) => e.user_id === me.id).reduce((s, e) => s + Math.round(Number(e.hours) * 100), 0) / 100;

  const log = async (v: { hours: number; work_date: string; note: string }) => {
    await save('time_entries', {
      id: newId(),
      job_id: job.id,
      task_id: task.id,
      user_id: me.id,
      work_date: v.work_date,
      hours: v.hours,
      note: v.note,
      edited: false,
      created_at: new Date().toISOString(),
    });
    setSaved(`${formatHours(v.hours)} hrs saved for ${dayLabel(v.work_date).toLowerCase()}.`);
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <CommandBar title={task.name} subtitle={[`Line ${task.line_no}`, phase?.name, job.name].filter(Boolean).join(' · ')} back />
      <View style={styles.summary}>
        <Stat label="Sold" value={formatHours(sold)} />
        <Stat label="Actual" value={formatHours(actual)} bad={over} />
        <Stat label={over ? 'Over' : 'Remaining'} value={formatHours(Math.abs(sold - actual))} bad={over} good={!over} />
        {seesPercentages(me.role) ? <Stat label="Used" value={pct === null ? '—' : `${pct}%`} bad={over} /> : null}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {task.kind !== 'planned' ? (
          <View style={styles.pad}>
            <Pill text={task.kind === 'extra_productive' ? 'Extra · productive (VO)' : 'Extra · non-productive'} tone="warn" />
          </View>
        ) : null}

        <SectionBar title={mine ? `Log hours · you have ${formatHours(mine)} hrs here` : 'Log hours'} />
        <View style={styles.pad}>
          {access.ok ? (
            <>
              {saved ? <Notice tone="ok">{saved} It’s on this phone and goes to the office at the next sync.</Notice> : null}
              <LogHoursForm submitLabel="Save hours" onSubmit={log} dayTotalFor={(d) => dayTotal(allEntries, me.id, d)} />
            </>
          ) : (
            <Notice tone="warn">{access.reason}</Notice>
          )}
        </View>

        <SectionBar title={`Hours logged · ${entries.length}`} />
        <EntryList job={job} entries={entries} />

        <SectionBar title={`Photos & files · ${attachments.length}`} />
        <View style={styles.pad}>
          <Attachments job={job} taskId={task.id} items={attachments} canAdd />
        </View>

        <SectionBar title={`Comments · ${comments.length}`} />
        <View style={styles.pad}>
          <Comments job={job} taskId={task.id} items={comments} canAdd />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Stat({ label, value, bad, good }: { label: string; value: string; bad?: boolean; good?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, bad && { color: Colors.danger }, good && { color: Colors.successDark }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  pad: { padding: 16, gap: 10 },
  summary: { flexDirection: 'row', backgroundColor: Colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: Colors.border },
  stat: { flex: 1, paddingVertical: 12, alignItems: 'center', gap: 2 },
  statLabel: { fontFamily: Fonts.semibold, fontSize: 11, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontFamily: Fonts.bold, fontSize: 22, color: Colors.text },
});
