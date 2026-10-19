import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/ui';
import { formatHours } from '@/data/totals';
import { addDays, dayLabel, today } from '@/logging/dates';
import { checkEntry } from '@/logging/rules';
import Colors, { Fonts } from '@/theme/colors';

export interface EntryValues {
  hours: number;
  work_date: string;
  note: string;
}

const QUICK_HOURS = ['1', '2', '4', '6', '8'];
const RECENT_DAYS = 7;

// Day, hours and an optional note. Used to log new hours and to change an entry.
export function LogHoursForm({
  initial,
  submitLabel,
  onSubmit,
  dayTotalFor,
}: {
  initial?: { hours: number; work_date: string; note: string };
  submitLabel: string;
  onSubmit: (v: EntryValues) => Promise<void> | void;
  // Hours already logged that day (by this person, on every job), for the
  // long-day warning.
  dayTotalFor: (day: string) => number;
}) {
  const [day, setDay] = useState(initial?.work_date ?? today());
  const [hours, setHours] = useState(initial ? String(initial.hours) : '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [otherDay, setOtherDay] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => Array.from({ length: RECENT_DAYS }, (_, i) => addDays(today(), -i)), []);
  const check = checkEntry({ hours, work_date: day });
  const total = check.value ? dayTotalFor(day) + check.value.hours : null;

  const submit = async () => {
    setTried(true);
    if (!check.value) return;
    setBusy(true);
    try {
      await onSubmit({ ...check.value, note: note.trim() });
      if (!initial) {
        setHours('');
        setNote('');
        setTried(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={styles.label}>Day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {days.map((d) => (
            <Chip
              key={d}
              text={dayLabel(d)}
              on={!otherDay && day === d}
              onPress={() => {
                setOtherDay(false);
                setDay(d);
              }}
            />
          ))}
          <Chip text="Other date" on={otherDay || !days.includes(day)} onPress={() => setOtherDay(true)} />
        </ScrollView>
        {otherDay || !days.includes(day) ? (
          <TextInput
            value={day}
            onChangeText={setDay}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.textTertiary}
            accessibilityLabel="Date worked"
            autoCapitalize="none"
            style={styles.input}
          />
        ) : null}
        {tried && check.work_date ? <Text style={styles.error}>{check.work_date}</Text> : null}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={styles.label}>Hours</Text>
        <View style={styles.hoursRow}>
          <TextInput
            value={hours}
            onChangeText={setHours}
            placeholder="0"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="decimal-pad"
            accessibilityLabel="Hours worked"
            style={[styles.input, styles.hoursInput]}
          />
          {QUICK_HOURS.map((h) => (
            <Chip key={h} text={h} on={hours === h} onPress={() => setHours(h)} />
          ))}
        </View>
        {tried && check.hours ? <Text style={styles.error}>{check.hours}</Text> : null}
        {total !== null && total > 12 ? (
          <Text style={styles.warn}>That makes {formatHours(total)} hrs on {dayLabel(day).toLowerCase()} — check it’s right.</Text>
        ) : null}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={styles.label}>Note (optional)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="What was done, anything holding it up…"
          placeholderTextColor={Colors.textTertiary}
          accessibilityLabel="Note"
          multiline
          style={[styles.input, { minHeight: 70, paddingTop: 12, textAlignVertical: 'top' }]}
        />
      </View>

      <Button title={submitLabel} icon="checkmark" onPress={() => void submit()} loading={busy} />
    </View>
  );
}

function Chip({ text, on, onPress }: { text: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.chipText, on && { color: Colors.textOnDark }]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: Fonts.semibold, fontSize: 13, color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.field,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 14,
    minHeight: 50,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.text,
  },
  hoursRow: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  hoursInput: { width: 90, fontFamily: Fonts.bold, fontSize: 20, textAlign: 'center' },
  chip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: Colors.selected, borderColor: Colors.selected },
  chipText: { fontFamily: Fonts.semibold, fontSize: 14, color: Colors.text },
  error: { fontFamily: Fonts.medium, fontSize: 13, color: Colors.danger },
  warn: { fontFamily: Fonts.medium, fontSize: 13, color: Colors.warningDark },
});
