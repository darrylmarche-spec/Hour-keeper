import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, CommandBar, Notice, Pill, SectionBar } from '@/components/ui';
import { newId, useIsPending, useMe, useSave, useTable } from '@/data/DataProvider';
import { Feedback } from '@/data/schema';
import { deviceLabel, VERSION_LABEL } from '@/lib/appInfo';
import Colors, { Fonts } from '@/theme/colors';

const KINDS: [Feedback['kind'], string, string][] = [
  ['problem', 'Something’s wrong', 'It didn’t work, or did something odd'],
  ['idea', 'Idea', 'Something that would make it better'],
  ['other', 'Other', 'Anything else'],
];
const STATUS: Record<Feedback['status'], [string, 'neutral' | 'warn' | 'ok']> = {
  new: ['Sent', 'neutral'],
  seen: ['Seen', 'warn'],
  done: ['Done', 'ok'],
};

// Beta feedback: a few words about what happened or what would help.
// Saved on the device first, like everything else, so it works on site.
export default function FeedbackScreen() {
  const me = useMe()!;
  const save = useSave();
  const all = useTable('feedback');
  const [kind, setKind] = useState<Feedback['kind']>('problem');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);

  const mine = useMemo(
    () => all.filter((f) => f.user_id === me.id).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    [all, me.id],
  );

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    await save('feedback', {
      id: newId(),
      user_id: me.id,
      kind,
      body: text.slice(0, 4000),
      screen: '',
      app_version: VERSION_LABEL,
      device: deviceLabel(),
      status: 'new',
      created_at: new Date().toISOString(),
    });
    setBody('');
    setSent(true);
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <CommandBar title="Send feedback" subtitle="Beta — every bit helps" back />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.pad}>
          {sent ? <Notice tone="ok">Thanks — it’s on its way. It sends with the next sync if you’re out of signal.</Notice> : null}
          <Text style={styles.label}>What kind?</Text>
          {KINDS.map(([k, title, detail]) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              accessibilityRole="radio"
              accessibilityState={{ checked: kind === k }}
              style={[styles.kind, kind === k && styles.kindOn]}
            >
              <Text style={[styles.kindTitle, kind === k && { color: Colors.textOnDark }]}>{title}</Text>
              <Text style={[styles.kindDetail, kind === k && { color: Colors.textOnDarkMuted }]}>{detail}</Text>
            </Pressable>
          ))}
          <Text style={styles.label}>Tell us</Text>
          <TextInput
            value={body}
            onChangeText={(t) => {
              setBody(t);
              setSent(false);
            }}
            placeholder={kind === 'problem' ? 'What were you doing, and what happened?' : 'What would help?'}
            placeholderTextColor={Colors.textTertiary}
            accessibilityLabel="Feedback"
            multiline
            maxLength={4000}
            style={styles.input}
          />
          <Text style={styles.hint}>Your name, the app version ({VERSION_LABEL}) and the type of phone are included.</Text>
          <Button title="Send feedback" icon="send" onPress={() => void send()} disabled={!body.trim()} />
        </View>

        {mine.length ? (
          <>
            <SectionBar title={`What you’ve sent · ${mine.length}`} />
            {mine.map((f) => (
              <SentRow key={f.id} item={f} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SentRow({ item }: { item: Feedback }) {
  const pending = useIsPending('feedback', item.id);
  const [label, tone] = STATUS[item.status];
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.when}>{item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}</Text>
        {pending ? <Pill text="Waiting to send" /> : <Pill text={label} tone={tone} />}
      </View>
      <Text style={styles.body}>{item.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  pad: { padding: 16, gap: 10 },
  label: { fontFamily: Fonts.semibold, fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  kind: { borderWidth: 1, borderColor: Colors.borderStrong, backgroundColor: Colors.field, borderRadius: 10, padding: 12, gap: 2 },
  kindOn: { backgroundColor: Colors.selected, borderColor: Colors.selected },
  kindTitle: { fontFamily: Fonts.semibold, fontSize: 15, color: Colors.text },
  kindDetail: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.field,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    minHeight: 120,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.text,
    textAlignVertical: 'top',
  },
  hint: { fontFamily: Fonts.regular, fontSize: 12.5, color: Colors.textTertiary },
  row: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 4 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  when: { fontFamily: Fonts.semibold, fontSize: 13, color: Colors.textSecondary },
  body: { fontFamily: Fonts.regular, fontSize: 15, color: Colors.text },
});
