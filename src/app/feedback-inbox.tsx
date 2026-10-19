import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, CommandBar, EmptyState, goBackOrHome, Pill, SectionBar } from '@/components/ui';
import { useMe, useSave, useTable } from '@/data/DataProvider';
import { AppError, Feedback } from '@/data/schema';
import Colors, { Fonts } from '@/theme/colors';

type Tab = 'feedback' | 'problems';
const ORDER: Record<Feedback['status'], number> = { new: 0, seen: 1, done: 2 };
const KIND_LABEL: Record<Feedback['kind'], string> = { problem: 'Problem', idea: 'Idea', other: 'Other' };

// Admins: what beta testers sent, and problems the app reported by itself.
export default function FeedbackInbox() {
  const me = useMe()!;
  const feedback = useTable('feedback');
  const errors = useTable('app_errors');
  const profiles = useTable('profiles');
  const save = useSave();
  const [tab, setTab] = useState<Tab>('feedback');
  const [open, setOpen] = useState<string | null>(null);

  const nameOf = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return p?.full_name || p?.email || 'Someone';
  };
  const items = useMemo(
    () =>
      [...feedback].sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    [feedback],
  );
  const problems = useMemo(() => [...errors].sort((a, b) => (b.updated_at ?? '~').localeCompare(a.updated_at ?? '~')), [errors]);
  const newCount = feedback.filter((f) => f.status === 'new').length;

  if (me.role !== 'admin') {
    return (
      <View style={styles.screen}>
        <CommandBar title="Feedback" back />
        <EmptyState icon="lock-closed-outline" title="Only admins can see everyone’s feedback">
          <Button title="Back" onPress={goBackOrHome} style={{ minWidth: 200 }} />
        </EmptyState>
      </View>
    );
  }

  const setStatus = (f: Feedback, status: Feedback['status']) => void save('feedback', { ...f, status });

  return (
    <View style={styles.screen}>
      <CommandBar title="Feedback & problems" subtitle={`${newCount} new`} back />
      <View style={styles.tabs}>
        {(
          [
            ['feedback', `Feedback · ${feedback.length}`],
            ['problems', `Problems · ${errors.length}`],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} style={[styles.tab, tab === t && styles.tabOn]}>
            <Text style={[styles.tabText, tab === t && { color: Colors.textOnDark }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {tab === 'feedback' ? (
          items.length ? (
            items.map((f) => (
              <View key={f.id} style={[styles.item, f.status === 'done' && { opacity: 0.6 }]}>
                <View style={styles.head}>
                  <Pill text={KIND_LABEL[f.kind]} tone={f.kind === 'problem' ? 'bad' : 'neutral'} />
                  <Text style={styles.who}>{nameOf(f.user_id)}</Text>
                  <Text style={styles.when}>{f.created_at ? new Date(f.created_at).toLocaleString() : ''}</Text>
                </View>
                <Text style={styles.body}>{f.body}</Text>
                <Text style={styles.meta}>
                  {f.app_version} · {f.device}
                </Text>
                <View style={styles.buttons}>
                  {f.status === 'new' ? <Button title="Mark seen" variant="secondary" onPress={() => setStatus(f, 'seen')} style={styles.btn} /> : null}
                  {f.status !== 'done' ? (
                    <Button title="Done" icon="checkmark" variant="secondary" onPress={() => setStatus(f, 'done')} style={styles.btn} />
                  ) : (
                    <Button title="Reopen" variant="ghost" onPress={() => setStatus(f, 'seen')} style={styles.btn} />
                  )}
                </View>
              </View>
            ))
          ) : (
            <EmptyState icon="chatbubbles-outline" title="No feedback yet" message="Testers send it from More → Send feedback." />
          )
        ) : problems.length ? (
          <>
            <SectionBar title="Newest first — tap for details" />
            {problems.map((e) => (
              <ProblemRow key={e.id} item={e} who={nameOf(e.user_id)} open={open === e.id} onPress={() => setOpen(open === e.id ? null : e.id)} />
            ))}
          </>
        ) : (
          <EmptyState icon="checkmark-circle-outline" title="No problems reported" message="Crashes and unexpected errors show here automatically." />
        )}
      </ScrollView>
    </View>
  );
}

function ProblemRow({ item, who, open, onPress }: { item: AppError; who: string; open: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.item, pressed && { backgroundColor: Colors.surfacePressed }]}>
      <View style={styles.head}>
        <Text style={styles.who}>{who}</Text>
        {item.count > 1 ? <Pill text={`×${item.count}`} tone="warn" /> : null}
        <Text style={styles.when}>{item.updated_at ? new Date(item.updated_at).toLocaleString() : 'not sent yet'}</Text>
      </View>
      <Text style={styles.problem} numberOfLines={open ? undefined : 2}>
        {item.message}
      </Text>
      <Text style={styles.meta}>
        {item.screen || 'unknown screen'} · {item.app_version} · {item.device}
      </Text>
      {open && item.stack ? (
        <Text style={styles.stack} selectable>
          {item.stack}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  tabs: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: Colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flex: 1, minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: Colors.borderStrong, backgroundColor: Colors.field, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: Colors.selected, borderColor: Colors.selected },
  tabText: { fontFamily: Fonts.semibold, fontSize: 14, color: Colors.text },
  item: { paddingHorizontal: 16, paddingVertical: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  who: { fontFamily: Fonts.semibold, fontSize: 14, color: Colors.text },
  when: { fontFamily: Fonts.regular, fontSize: 12.5, color: Colors.textTertiary, marginLeft: 'auto' },
  body: { fontFamily: Fonts.regular, fontSize: 15, color: Colors.text, lineHeight: 21 },
  problem: { fontFamily: Fonts.medium, fontSize: 14, color: Colors.danger },
  meta: { fontFamily: Fonts.regular, fontSize: 12, color: Colors.textTertiary },
  stack: { fontFamily: 'monospace', fontSize: 11, color: Colors.textSecondary, backgroundColor: Colors.field, padding: 8, borderRadius: 6 },
  buttons: { flexDirection: 'row', gap: 8 },
  btn: { minHeight: 40, paddingHorizontal: 14 },
});

