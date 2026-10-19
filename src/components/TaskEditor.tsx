import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pill } from '@/components/ui';
import { Sheet, SheetOption } from '@/components/Sheet';
import { formatHours } from '@/data/totals';
import { DraftPhase, DraftProblems, DraftTask, draftKey, JobDraft, newTask, parseHours } from '@/jobs/draft';
import Colors, { Fonts } from '@/theme/colors';

// Edit a job's phases and tasks: rename, change hours, add, remove, reorder,
// move tasks between phases. Lines the importer wasn't sure about are
// highlighted until they're edited.
export function TaskEditor({
  draft,
  onChange,
  problems,
}: {
  draft: JobDraft;
  onChange: (d: JobDraft) => void;
  problems: DraftProblems;
}) {
  const [moving, setMoving] = useState<{ phaseKey: string; taskKey: string } | null>(null);

  const setPhases = (phases: DraftPhase[]) => onChange({ ...draft, phases });
  const updatePhase = (key: string, fn: (p: DraftPhase) => DraftPhase) =>
    setPhases(draft.phases.map((p) => (p.key === key ? fn(p) : p)));
  const updateTask = (pk: string, tk: string, patch: Partial<DraftTask>) =>
    updatePhase(pk, (p) => ({
      ...p,
      tasks: p.tasks.map((t) => (t.key === tk ? { ...t, ...patch, issues: [] } : t)),
    }));
  const moveInList = <T,>(list: T[], i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  const moveTaskTo = (targetKey: string) => {
    if (!moving) return;
    const from = draft.phases.find((p) => p.key === moving.phaseKey)!;
    const task = from.tasks.find((t) => t.key === moving.taskKey)!;
    setPhases(
      draft.phases.map((p) => {
        if (p.key === moving.phaseKey && p.key === targetKey) return p;
        if (p.key === moving.phaseKey) return { ...p, tasks: p.tasks.filter((t) => t.key !== task.key) };
        if (p.key === targetKey) return { ...p, tasks: [...p.tasks, task] };
        return p;
      }),
    );
    setMoving(null);
  };

  const addPhase = () =>
    setPhases([...draft.phases, { key: draftKey(), name: 'New phase', tasks: [newTask()] }]);

  return (
    <View>
      {problems.phases.get('_') ? <Text style={[styles.error, { padding: 12 }]}>{problems.phases.get('_')}</Text> : null}
      {draft.phases.map((phase, pi) => {
        const phaseHours = phase.tasks.reduce((s, t) => s + (parseHours(t.hours) ?? 0), 0);
        const hasLogged = phase.tasks.some((t) => t.loggedHours > 0);
        return (
          <View key={phase.key} style={styles.phase}>
            <View style={styles.phaseBar}>
              <TextInput
                value={phase.name}
                onChangeText={(name) => updatePhase(phase.key, (p) => ({ ...p, name }))}
                style={styles.phaseName}
                accessibilityLabel={`Phase ${pi + 1} name`}
              />
              <Text style={styles.phaseHours}>{formatHours(phaseHours)} hrs</Text>
              <IconBtn icon="arrow-up" label="Move phase up" onPress={() => setPhases(moveInList(draft.phases, pi, -1))} disabled={pi === 0} />
              <IconBtn
                icon="arrow-down"
                label="Move phase down"
                onPress={() => setPhases(moveInList(draft.phases, pi, 1))}
                disabled={pi === draft.phases.length - 1}
              />
              <IconBtn
                icon="trash-outline"
                label="Remove phase"
                onPress={() => setPhases(draft.phases.filter((p) => p.key !== phase.key))}
                disabled={hasLogged}
              />
            </View>
            {problems.phases.get(phase.key) ? <Text style={[styles.error, { paddingHorizontal: 12 }]}>{problems.phases.get(phase.key)}</Text> : null}

            {phase.tasks.map((task, ti) => {
              const problem = problems.tasks.get(task.key);
              const flagged = task.issues.length > 0;
              return (
                <View key={task.key} style={[styles.task, flagged && styles.taskFlagged, problem && styles.taskProblem]}>
                  <View style={styles.taskRow}>
                    <TextInput
                      value={task.lineNo}
                      onChangeText={(lineNo) => updateTask(phase.key, task.key, { lineNo })}
                      style={[styles.input, styles.lineNo]}
                      placeholder="#"
                      placeholderTextColor={Colors.textTertiary}
                      accessibilityLabel="Line number"
                    />
                    <TextInput
                      value={task.name}
                      onChangeText={(name) => updateTask(phase.key, task.key, { name })}
                      style={[styles.input, styles.name]}
                      placeholder="Task name"
                      placeholderTextColor={Colors.textTertiary}
                      multiline
                      accessibilityLabel="Task name"
                    />
                    <TextInput
                      value={task.hours}
                      onChangeText={(hours) => updateTask(phase.key, task.key, { hours })}
                      style={[styles.input, styles.hours]}
                      placeholder="0"
                      placeholderTextColor={Colors.textTertiary}
                      keyboardType="decimal-pad"
                      accessibilityLabel={`Sold hours for ${task.name || 'task'}`}
                    />
                  </View>
                  <View style={styles.taskFoot}>
                    <View style={{ flex: 1, gap: 4 }}>
                      {task.kind !== 'planned' ? (
                        <Pill text={task.kind === 'extra_productive' ? 'Extra · productive' : 'Extra · non-productive'} tone="warn" />
                      ) : null}
                      {flagged ? <Text style={styles.flag}>Check: {task.issues.join(' · ')}</Text> : null}
                      {problem ? <Text style={styles.error}>{problem}</Text> : null}
                      {task.loggedHours > 0 ? (
                        <Text style={styles.logged}>{formatHours(task.loggedHours)} hrs already logged — can’t be removed</Text>
                      ) : null}
                    </View>
                    <IconBtn icon="arrow-up" label="Move task up" onPress={() => updatePhase(phase.key, (p) => ({ ...p, tasks: moveInList(p.tasks, ti, -1) }))} disabled={ti === 0} small />
                    <IconBtn
                      icon="arrow-down"
                      label="Move task down"
                      onPress={() => updatePhase(phase.key, (p) => ({ ...p, tasks: moveInList(p.tasks, ti, 1) }))}
                      disabled={ti === phase.tasks.length - 1}
                      small
                    />
                    <IconBtn icon="swap-horizontal" label="Move to another phase" onPress={() => setMoving({ phaseKey: phase.key, taskKey: task.key })} small />
                    <IconBtn
                      icon="trash-outline"
                      label="Remove task"
                      onPress={() => updatePhase(phase.key, (p) => ({ ...p, tasks: p.tasks.filter((t) => t.key !== task.key) }))}
                      disabled={task.loggedHours > 0}
                      small
                    />
                  </View>
                </View>
              );
            })}

            <Pressable
              onPress={() => updatePhase(phase.key, (p) => ({ ...p, tasks: [...p.tasks, newTask()] }))}
              style={({ pressed }) => [styles.addRow, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
              <Text style={styles.addText}>Add task to {phase.name || 'this phase'}</Text>
            </Pressable>
          </View>
        );
      })}

      <Pressable onPress={addPhase} style={({ pressed }) => [styles.addPhase, pressed && { opacity: 0.7 }]} accessibilityRole="button">
        <Ionicons name="add" size={18} color={Colors.primary} />
        <Text style={styles.addText}>Add phase</Text>
      </Pressable>

      <Sheet visible={!!moving} title="Move task to…" onClose={() => setMoving(null)}>
        {draft.phases.map((p) => (
          <SheetOption
            key={p.key}
            label={p.name || 'Unnamed phase'}
            detail={`${p.tasks.length} task${p.tasks.length === 1 ? '' : 's'}`}
            selected={p.key === moving?.phaseKey}
            onPress={() => moveTaskTo(p.key)}
          />
        ))}
      </Sheet>
    </View>
  );
}

function IconBtn({
  icon,
  label,
  onPress,
  disabled,
  small,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.iconBtn, small && styles.iconBtnSmall, disabled && { opacity: 0.3 }, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={small ? 16 : 18} color={Colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  phase: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  phaseBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.sectionBar,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  phaseName: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: 14,
    color: Colors.text,
    textTransform: 'uppercase',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.35)',
    minWidth: 0,
  },
  phaseHours: { fontFamily: Fonts.bold, fontSize: 13, color: Colors.textSecondary, marginHorizontal: 4 },
  task: { paddingHorizontal: 10, paddingVertical: 8, gap: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  taskFlagged: { backgroundColor: Colors.warningLight, borderLeftWidth: 4, borderLeftColor: Colors.warning },
  taskProblem: { backgroundColor: Colors.dangerLight, borderLeftWidth: 4, borderLeftColor: Colors.danger },
  taskRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  input: {
    backgroundColor: Colors.field,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.text,
  },
  lineNo: { width: 44, textAlign: 'center' },
  name: { flex: 1, minWidth: 0 },
  hours: { width: 64, textAlign: 'right', fontFamily: Fonts.bold },
  taskFoot: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  flag: { fontFamily: Fonts.medium, fontSize: 12.5, color: Colors.warningDark },
  error: { fontFamily: Fonts.semibold, fontSize: 13, color: Colors.danger },
  logged: { fontFamily: Fonts.medium, fontSize: 12.5, color: Colors.textSecondary },
  iconBtn: { padding: 6, borderRadius: 6 },
  iconBtnSmall: { padding: 5 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 12 },
  addPhase: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    margin: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
  },
  addText: { fontFamily: Fonts.semibold, fontSize: 14.5, color: Colors.primary },
});
