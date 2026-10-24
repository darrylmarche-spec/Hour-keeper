import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LogHoursForm } from '@/components/LogHoursForm';
import { Sheet } from '@/components/Sheet';
import { Button, Pill } from '@/components/ui';
import { useIsPending, useMe, useRejectedReason, useSave, useTable } from '@/data/DataProvider';
import { Job, TimeEntry } from '@/data/schema';
import { formatHours } from '@/data/totals';
import { confirm } from '@/lib/confirm';
import { dayLabel } from '@/logging/dates';
import { canEditEntry, dayTotal, describeEdit } from '@/logging/rules';
import Colors, { Fonts } from '@/theme/colors';

// Hours logged against one task, newest day first. Tap your own entry (or
// anyone's, for PMs/supervisors) to change it; tap "Edited" to see what changed.
export function EntryList({ job, entries }: { job: Job; entries: readonly TimeEntry[] }) {
  const me = useMe()!;
  const members = useTable('job_members');
  const profiles = useTable('profiles');
  const allEntries = useTable('time_entries');
  const save = useSave();
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [history, setHistory] = useState<TimeEntry | null>(null);

  const sorted = useMemo(
    () =>
      [...entries].sort(
        (a, b) => b.work_date.localeCompare(a.work_date) || (b.created_at ?? '~').localeCompare(a.created_at ?? '~'),
      ),
    [entries],
  );
  const nameOf = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return id === me.id ? 'You' : p?.full_name || p?.email || 'Someone';
  };

  const saveEdit = async (e: TimeEntry, v: { hours: number; work_date: string; note: string }) => {
    await save('time_entries', { ...e, ...v, edited: true });
    setEditing(null);
  };

  const remove = async (e: TimeEntry) => {
    const who = e.user_id === me.id ? 'your' : `${nameOf(e.user_id)}’s`;
    const ok = await confirm(
      `Remove ${formatHours(Number(e.hours))} hrs?`,
      `This takes ${who} entry for ${dayLabel(e.work_date).toLowerCase()} off the job. The change is recorded in the job’s history.`,
      'Remove',
    );
    if (!ok) return;
    await save('time_entries', { ...e, deleted_at: new Date().toISOString(), edited: true });
    setEditing(null);
  };

  if (!sorted.length) return <Text style={styles.empty}>No hours logged on this task yet.</Text>;

  return (
    <View>
      {sorted.map((e) => (
        <EntryRow
          key={e.id}
          entry={e}
          who={nameOf(e.user_id)}
          canEdit={canEditEntry(e, job, me, members)}
          onEdit={() => setEditing(e)}
          onHistory={() => setHistory(e)}
        />
      ))}

      <Sheet visible={!!editing} title="Change hours" onClose={() => setEditing(null)}>
        {editing ? (
          <>
            {editing.user_id !== me.id ? (
              <Text style={styles.help}>You’re changing {nameOf(editing.user_id)}’s entry. They’ll see it marked “Edited”.</Text>
            ) : (
              <Text style={styles.help}>The entry will be marked “Edited”, and the change kept in its history.</Text>
            )}
            <LogHoursForm
              initial={{ hours: Number(editing.hours), work_date: editing.work_date, note: editing.note }}
              submitLabel="Save change"
              onSubmit={(v) => saveEdit(editing, v)}
              dayTotalFor={(d) => dayTotal(allEntries, editing.user_id, d, editing.id)}
            />
            <Button title="Remove this entry" variant="danger" icon="trash-outline" onPress={() => void remove(editing)} />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={!!history} title="What changed" onClose={() => setHistory(null)}>
        {history ? <History entry={history} nameOf={nameOf} /> : null}
      </Sheet>
    </View>
  );
}

function EntryRow({
  entry,
  who,
  canEdit,
  onEdit,
  onHistory,
}: {
  entry: TimeEntry;
  who: string;
  canEdit: boolean;
  onEdit: () => void;
  onHistory: () => void;
}) {
  const pending = useIsPending('time_entries', entry.id);
  const refused = useRejectedReason('time_entries', entry.id);
  return (
    <Pressable
      onPress={canEdit ? onEdit : undefined}
      disabled={!canEdit}
      accessibilityRole={canEdit ? 'button' : undefined}
      accessibilityLabel={`${who}, ${formatHours(Number(entry.hours))} hours, ${dayLabel(entry.work_date)}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.surfacePressed }]}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.who}>
          {who} · <Text style={styles.day}>{dayLabel(entry.work_date)}</Text>
        </Text>
        {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
        <View style={styles.tags}>
          {entry.edited ? (
            <Pressable onPress={onHistory} accessibilityRole="button" accessibilityLabel="See what changed" hitSlop={6}>
              <Pill text="Edited · see changes" tone="warn" />
            </Pressable>
          ) : null}
          {pending ? <Pill text="Waiting to send" /> : null}
          {refused ? <Pill text="Not saved · see Sync" tone="bad" /> : null}
        </View>
      </View>
      <Text style={styles.hours}>{formatHours(Number(entry.hours))}</Text>
      {canEdit ? <Ionicons name="create-outline" size={18} color={Colors.textTertiary} /> : null}
    </Pressable>
  );
}

function History({ entry, nameOf }: { entry: TimeEntry; nameOf: (id: string) => string }) {
  const edits = useTable('time_entry_edits');
  const tasks = useTable('tasks');
  const mine = edits
    .filter((e) => e.time_entry_id === entry.id)
    .sort((a, b) => b.edited_at.localeCompare(a.edited_at));
  const taskName = (id: string) => tasks.find((t) => t.id === id)?.name ?? 'another task';
  if (!mine.length) {
    return (
      <Text style={styles.help}>
        The change history arrives from the server at the next sync. If this change was made offline, it shows once it’s been sent.
      </Text>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      {mine.map((e) => (
        <View key={e.id} style={styles.histItem}>
          <Text style={styles.histWho}>
            {e.edited_by ? nameOf(e.edited_by) : 'Someone'} · {new Date(e.edited_at).toLocaleString()}
          </Text>
          {describeEdit(e, taskName).map((line) => (
            <Text key={line} style={styles.histLine}>
              {line}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 16, fontFamily: Fonts.regular, fontSize: 14, color: Colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  who: { fontFamily: Fonts.semibold, fontSize: 15, color: Colors.text },
  day: { fontFamily: Fonts.regular, color: Colors.textSecondary },
  note: { fontFamily: Fonts.regular, fontSize: 14, color: Colors.textSecondary },
  tags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  hours: { fontFamily: Fonts.bold, fontSize: 20, color: Colors.text },
  help: { fontFamily: Fonts.regular, fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  histItem: { gap: 3, borderLeftWidth: 3, borderLeftColor: Colors.warning, paddingLeft: 10 },
  histWho: { fontFamily: Fonts.semibold, fontSize: 13, color: Colors.textSecondary },
  histLine: { fontFamily: Fonts.medium, fontSize: 15, color: Colors.text },
});
