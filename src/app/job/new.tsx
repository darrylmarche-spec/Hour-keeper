import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { JobDetailsForm } from '@/components/JobDetailsForm';
import { TaskEditor } from '@/components/TaskEditor';
import { Button, CommandBar, EmptyState, goBackOrHome, Notice, SectionBar } from '@/components/ui';
import { newId, useMe, useSaveMany, useTable } from '@/data/DataProvider';
import { BaseRow, TableName, Template } from '@/data/schema';
import { formatHours, quotedMismatch } from '@/data/totals';
import { pickTaskFile } from '@/import/pickFile';
import { ImportError, readTaskFile } from '@/import/readTaskFile';
import {
  blankDraft,
  checkDraft,
  draftFromParsed,
  draftFromTemplate,
  draftToRows,
  draftTotal,
  emptyDetails,
  JobDraft,
  TemplateSource,
} from '@/jobs/draft';
import { confirm } from '@/lib/confirm';
import { managesJobs } from '@/lib/roles';
import Colors, { Fonts } from '@/theme/colors';

type Step = 'start' | 'check';

export default function NewJobScreen() {
  const me = useMe()!;
  const templates = useTable('templates');
  const tPhases = useTable('template_phases');
  const tTasks = useTable('template_tasks');
  const saveMany = useSaveMany();

  const [step, setStep] = useState<Step>('start');
  const [details, setDetails] = useState(emptyDetails());
  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [source, setSource] = useState<{ label: string; templateId: string | null; warnings: string[] }>({
    label: '',
    templateId: null,
    warnings: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  const sortedTemplates = useMemo(() => [...templates].sort((a, b) => a.name.localeCompare(b.name)), [templates]);
  const srcFor = (t: Template): TemplateSource => ({ template: t, phases: tPhases, tasks: tTasks });

  if (!managesJobs(me.role)) {
    return (
      <View style={styles.screen}>
        <CommandBar title="New job" back />
        <EmptyState icon="lock-closed-outline" title="Only PMs, supervisors and admins can set up jobs" />
      </View>
    );
  }

  const fromTemplate = (t: Template) => {
    setDraft(draftFromTemplate(srcFor(t), details));
    setSource({ label: `From template: ${t.name}`, templateId: t.id, warnings: [] });
    setStep('check');
  };

  const fromBlank = () => {
    setDraft(blankDraft(details));
    setSource({ label: 'Blank job', templateId: null, warnings: [] });
    setStep('check');
  };

  const fromFile = async () => {
    setError(null);
    let file;
    try {
      file = await pickTaskFile();
    } catch {
      setError('That file couldn’t be opened. Try again, or pick a different file.');
      return;
    }
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await readTaskFile(file);
      if (!parsed.lines.length) {
        setError(parsed.warnings[0] ?? 'No task lines were found in that file.');
        return;
      }
      // Match imported lines to the template's phases where they line up.
      const template = sortedTemplates[0];
      setDraft(draftFromParsed(parsed, template ? srcFor(template) : undefined, details));
      setSource({ label: `Imported from ${file.name}`, templateId: null, warnings: parsed.warnings });
      setStep('check');
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'Something went wrong reading that file. Try exporting it again.');
    } finally {
      setBusy(false);
    }
  };

  const problems = draft ? checkDraft(draft) : null;
  const total = draft ? draftTotal(draft) : 0;
  const quoted = draft?.details.quoted_total ? Number(draft.details.quoted_total) : null;
  const flagged = draft ? draft.phases.flatMap((p) => p.tasks).filter((t) => t.issues.length).length : 0;

  const back = async () => {
    if (step === 'check') {
      if (await confirm('Go back?', 'Changes to the task list will be lost.', 'Go back')) {
        if (draft) setDetails(draft.details);
        setStep('start');
        setDraft(null);
      }
      return;
    }
    goBackOrHome();
  };

  const save = async () => {
    if (!draft || !problems) return;
    if (problems.count) {
      setShowProblems(true);
      return;
    }
    if (flagged) {
      const ok = await confirm(
        `${flagged} line${flagged === 1 ? '' : 's'} still marked “check”`,
        'They’ll be saved as they are. You can edit the job later.',
        'Save anyway',
      );
      if (!ok) return;
    }
    setBusy(true);
    const jobId = newId();
    const rows = draftToRows(draft, {
      jobId,
      existingPhases: [],
      existingTasks: [],
      userId: me.id,
      newId,
      templateId: source.templateId,
    });
    const items: { table: TableName; row: BaseRow }[] = [
      { table: 'jobs', row: rows.job },
      ...rows.phases.map((row) => ({ table: 'phases' as const, row })),
      ...rows.tasks.map((row) => ({ table: 'tasks' as const, row })),
    ];
    await saveMany(items);
    setBusy(false);
    router.replace({ pathname: '/job/[id]', params: { id: jobId } });
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <CommandBar
        title={step === 'start' ? 'New job' : 'Check tasks'}
        subtitle={step === 'check' ? `Step 2 of 2 · ${source.label}` : 'Step 1 of 2'}
        back
        onBack={() => void back()}
      />

      {step === 'start' ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <SectionBar title="Job details" />
          <View style={styles.pad}>
            <JobDetailsForm details={details} onChange={setDetails} />
            <Text style={styles.hint}>
              You can leave these until after an import — the job name and sheet total are picked up from the file.
            </Text>
          </View>

          <SectionBar title="Tasks and sold hours" />
          <View style={styles.pad}>
            {error ? <Notice tone="bad">{error}</Notice> : null}
            <Choice
              icon="document-attach-outline"
              title="Import a file"
              detail="Excel (.xlsx), CSV or PDF hours sheet. You’ll check every line before anything is saved."
              onPress={fromFile}
              busy={busy}
            />
            {sortedTemplates.map((t) => {
              const n = tTasks.filter((x) => x.template_id === t.id).length;
              const hrs = tTasks.filter((x) => x.template_id === t.id).reduce((s, x) => s + Number(x.sold_hours), 0);
              return (
                <Choice
                  key={t.id}
                  icon="copy-outline"
                  title={`Start from “${t.name}”`}
                  detail={`${n} tasks · ${formatHours(hrs)} sold hours — adjust to suit this job.`}
                  onPress={() => fromTemplate(t)}
                />
              );
            })}
            <Choice icon="create-outline" title="Start blank" detail="Type the tasks in yourself." onPress={fromBlank} />
          </View>
        </ScrollView>
      ) : draft && problems ? (
        <>
          <View style={styles.summary}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Sold hours</Text>
              <Text style={styles.statValue}>{formatHours(total)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Tasks</Text>
              <Text style={styles.statValue}>{draft.phases.reduce((s, p) => s + p.tasks.length, 0)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>To check</Text>
              <Text style={[styles.statValue, flagged + problems.count > 0 && { color: Colors.warningDark }]}>
                {flagged + problems.count}
              </Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={[styles.pad, { gap: 8 }]}>
              {source.warnings.map((w) => (
                <Notice key={w} tone="warn">
                  {w}
                </Notice>
              ))}
              {quoted !== null && quotedMismatch(quoted, total) ? (
                <Notice tone="warn">
                  The sheet total is {formatHours(quoted)} hrs but the task lines add up to {formatHours(total)} hrs. Reports use the
                  task lines — fix the lines or the sheet total so they agree.
                </Notice>
              ) : null}
              {flagged ? (
                <Notice tone="warn">
                  {flagged} line{flagged === 1 ? ' is' : 's are'} highlighted for checking (e.g. repeated line numbers). Editing a line
                  clears its highlight.
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
            <TaskEditor draft={draft} onChange={setDraft} problems={showProblems ? problems : { ...problems, tasks: new Map(), phases: new Map() }} />
          </ScrollView>
          <View style={styles.footer}>
            <Button title="Save job" icon="checkmark" onPress={save} loading={busy} style={{ flex: 1 }} />
          </View>
        </>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function Choice({
  icon,
  title,
  detail,
  onPress,
  busy,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={({ pressed }) => [styles.choice, pressed && { backgroundColor: Colors.surfacePressed }, busy && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={26} color={Colors.primary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.choiceTitle}>{busy ? 'Reading file…' : title}</Text>
        <Text style={styles.choiceDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  body: { paddingBottom: 40 },
  pad: { padding: 16, gap: 12 },
  hint: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.textTertiary },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.field,
  },
  choiceTitle: { fontFamily: Fonts.semibold, fontSize: 16, color: Colors.text },
  choiceDetail: { fontFamily: Fonts.regular, fontSize: 13.5, color: Colors.textSecondary, lineHeight: 19 },
  summary: { flexDirection: 'row', backgroundColor: Colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: Colors.border },
  stat: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  statLabel: { fontFamily: Fonts.semibold, fontSize: 11, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontFamily: Fonts.bold, fontSize: 22, color: Colors.text },
  footer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surfaceSecondary,
  },
});
