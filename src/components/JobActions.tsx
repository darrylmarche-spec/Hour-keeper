import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { Button, Field, Notice } from '@/components/ui';
import { newId, useMe, useSave, useSaveMany, useTable } from '@/data/DataProvider';
import { BaseRow, Job, JobStatus, TableName } from '@/data/schema';
import { draftFromJob, templateRowsFromDraft } from '@/jobs/draft';
import { confirm } from '@/lib/confirm';
import Colors, { Fonts } from '@/theme/colors';

// What a PM / supervisor / admin can do with a job, shown on the job screen.
export function JobActions({ job }: { job: Job }) {
  const me = useMe()!;
  const members = useTable('job_members');
  const phases = useTable('phases');
  const tasks = useTable('tasks');
  const save = useSave();
  const saveMany = useSaveMany();
  const [naming, setNaming] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savedTemplate, setSavedTemplate] = useState<string | null>(null);

  const team = members.filter((m) => m.job_id === job.id).length;

  const setStatus = async (status: JobStatus) => {
    const text: Record<JobStatus, [string, string, string]> = {
      released: [
        'Release to the field?',
        team
          ? `The ${team} assigned tech${team === 1 ? '' : 's'} will get this job on their phone at the next sync.`
          : 'No techs are assigned yet, so nobody will see it until you add them under Team.',
        'Release',
      ],
      complete: ['Mark the job complete?', 'Techs can no longer log hours on it. You can reopen it later for corrections.', 'Mark complete'],
      draft: ['Reopen?', '', 'Reopen'],
    };
    const [title, message, ok] =
      job.status === 'complete' && status === 'released'
        ? (['Reopen the job?', 'Assigned techs can log hours on it again.', 'Reopen'] as const)
        : text[status];
    if (!(await confirm(title, message, ok))) return;
    await save('jobs', { ...job, status });
  };

  const saveAsTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;
    const draft = draftFromJob(job, phases, tasks, []);
    const t = templateRowsFromDraft(name, draft, { newId, userId: me.id });
    const items: { table: TableName; row: BaseRow }[] = [
      { table: 'templates', row: t.template },
      ...t.phases.map((row) => ({ table: 'template_phases' as const, row })),
      ...t.tasks.map((row) => ({ table: 'template_tasks' as const, row })),
    ];
    await saveMany(items);
    setNaming(false);
    setSavedTemplate(name);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Action
          icon="create-outline"
          label="Edit job"
          onPress={() => router.push({ pathname: '/job/[id]/edit', params: { id: job.id } })}
        />
        <Action
          icon="people-outline"
          label={`Team · ${team}`}
          onPress={() => router.push({ pathname: '/job/[id]/team', params: { id: job.id } })}
        />
        <Action
          icon="copy-outline"
          label="Save as template"
          onPress={() => {
            setTemplateName(job.name);
            setNaming(true);
          }}
        />
      </View>

      {job.status === 'draft' ? (
        <Button title="Release to field" icon="paper-plane-outline" onPress={() => void setStatus('released')} />
      ) : job.status === 'released' ? (
        <Button title="Mark job complete" icon="flag-outline" variant="secondary" onPress={() => void setStatus('complete')} />
      ) : (
        <Button title="Reopen job" icon="refresh" variant="secondary" onPress={() => void setStatus('released')} />
      )}

      {savedTemplate ? <Notice tone="ok">Saved as template “{savedTemplate}”. It’s offered when you create a new job.</Notice> : null}

      <Sheet visible={naming} title="Save as template" onClose={() => setNaming(false)}>
        <Text style={styles.help}>The task list and sold hours become a starting point for new jobs. This job isn’t changed.</Text>
        <Field label="Template name" value={templateName} onChangeText={setTemplateName} autoFocus />
        <Button title="Save template" icon="checkmark" onPress={() => void saveAsTemplate()} disabled={!templateName.trim()} />
      </Sheet>
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: Colors.surfacePressed }]}
    >
      <Ionicons name={icon} size={20} color={Colors.primary} />
      <Text style={styles.actionLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  row: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.field,
  },
  actionLabel: { fontFamily: Fonts.semibold, fontSize: 12.5, color: Colors.text },
  help: { fontFamily: Fonts.regular, fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
});
