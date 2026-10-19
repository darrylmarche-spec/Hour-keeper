import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { JobDetailsForm } from '@/components/JobDetailsForm';
import { TaskEditor } from '@/components/TaskEditor';
import { Button, CommandBar, EmptyState, goBackOrHome, Notice, SectionBar } from '@/components/ui';
import { newId, useMe, useRow, useSaveMany, useTable } from '@/data/DataProvider';
import { BaseRow, TableName } from '@/data/schema';
import { formatHours } from '@/data/totals';
import { checkDraft, draftFromJob, draftToRows, draftTotal, JobDraft } from '@/jobs/draft';
import { confirm } from '@/lib/confirm';
import { managesJobs } from '@/lib/roles';
import Colors, { Fonts } from '@/theme/colors';

export default function EditJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe()!;
  const job = useRow('jobs', id);
  const phases = useTable('phases');
  const tasks = useTable('tasks');
  const entries = useTable('time_entries');
  const saveMany = useSaveMany();

  const initial = useMemo(() => (job ? draftFromJob(job, phases, tasks, entries) : null), [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<JobDraft | null>(initial);
  const [showProblems, setShowProblems] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!job || !draft || !managesJobs(me.role)) {
    return (
      <View style={styles.screen}>
        <CommandBar title="Edit job" back />
        <EmptyState
          icon={job ? 'lock-closed-outline' : 'search-outline'}
          title={job ? 'Only PMs, supervisors and admins can edit jobs' : 'Job not found'}
        >
          <Button title="Back" onPress={goBackOrHome} style={{ minWidth: 200 }} />
        </EmptyState>
      </View>
    );
  }

  const problems = checkDraft(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const leave = async () => {
    if (dirty && !(await confirm('Discard changes?', 'Your edits to this job haven’t been saved.', 'Discard'))) return;
    goBackOrHome();
  };

  const save = async () => {
    if (problems.count) {
      setShowProblems(true);
      return;
    }
    if (job.status !== 'draft') {
      const ok = await confirm(
        'This job is in the field',
        'Techs may already be logging hours against these tasks. Changes show on their phones at the next sync.',
        'Save changes',
      );
      if (!ok) return;
    }
    setBusy(true);
    const rows = draftToRows(draft, {
      jobId: job.id,
      existingJob: job,
      existingPhases: phases,
      existingTasks: tasks,
      userId: me.id,
      newId,
    });
    // Parents first: job, new/renamed phases, tasks, then removed phases.
    const items: { table: TableName; row: BaseRow }[] = [
      { table: 'jobs', row: rows.job },
      ...rows.phases.filter((p) => !p.deleted_at).map((row) => ({ table: 'phases' as const, row })),
      ...rows.tasks.map((row) => ({ table: 'tasks' as const, row })),
      ...rows.phases.filter((p) => p.deleted_at).map((row) => ({ table: 'phases' as const, row })),
    ];
    await saveMany(items);
    setBusy(false);
    router.back();
  };

  const remove = async () => {
    const ok = await confirm(
      `Delete “${job.name}”?`,
      'This draft job and its task list will be removed. This can’t be undone from the app.',
      'Delete job',
    );
    if (!ok) return;
    await saveMany([{ table: 'jobs', row: { ...job, deleted_at: new Date().toISOString() } }]);
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <CommandBar title="Edit job" subtitle={job.name} back onBack={() => void leave()} />
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {formatHours(draftTotal(draft))} sold hours · {draft.phases.reduce((s, p) => s + p.tasks.length, 0)} tasks
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.pad}>
          {job.status !== 'draft' ? (
            <Notice tone="warn">
              This job is in the field. You can still change tasks and sold hours, but tasks with hours logged can’t be removed.
            </Notice>
          ) : null}
          {showProblems && problems.count ? (
            <Notice tone="bad">Fix the {problems.count} item{problems.count === 1 ? '' : 's'} marked in red, then save.</Notice>
          ) : null}
        </View>
        <SectionBar title="Job details" />
        <View style={styles.pad}>
          <JobDetailsForm
            details={draft.details}
            onChange={(d) => setDraft({ ...draft, details: d })}
            problems={showProblems ? problems.details : {}}
          />
        </View>
        <SectionBar title="Phases and tasks" />
        <TaskEditor
          draft={draft}
          onChange={setDraft}
          problems={showProblems ? problems : { ...problems, tasks: new Map(), phases: new Map() }}
        />
        {job.status === 'draft' ? (
          <View style={styles.pad}>
            <Button title="Delete this draft job" variant="danger" icon="trash-outline" onPress={() => void remove()} />
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button title="Cancel" variant="secondary" onPress={() => void leave()} style={{ flex: 1 }} />
        <Button title="Save changes" icon="checkmark" onPress={() => void save()} loading={busy} disabled={!dirty} style={{ flex: 2 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  pad: { padding: 16, gap: 10 },
  summary: { backgroundColor: Colors.surfaceSecondary, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border },
  summaryText: { fontFamily: Fonts.bold, fontSize: 15, color: Colors.text },
  footer: { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surfaceSecondary },
});
