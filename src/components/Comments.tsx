import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Pill } from '@/components/ui';
import { newId, useIsPending, useMe, useSave, useTable } from '@/data/DataProvider';
import { Comment, Job } from '@/data/schema';
import { confirm } from '@/lib/confirm';
import Colors, { Fonts } from '@/theme/colors';

// Notes on a task, oldest first like a conversation.
export function Comments({ job, taskId, items, canAdd }: { job: Job; taskId: string | null; items: readonly Comment[]; canAdd: boolean }) {
  const me = useMe()!;
  const profiles = useTable('profiles');
  const save = useSave();
  const [text, setText] = useState('');

  const sorted = useMemo(() => [...items].sort((a, b) => (a.created_at ?? '~').localeCompare(b.created_at ?? '~')), [items]);
  const nameOf = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return id === me.id ? 'You' : p?.full_name || p?.email || 'Someone';
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    await save('comments', { id: newId(), job_id: job.id, task_id: taskId, user_id: me.id, body, created_at: new Date().toISOString() });
    setText('');
  };

  const remove = async (c: Comment) => {
    if (!(await confirm('Remove your comment?', c.body.slice(0, 120), 'Remove'))) return;
    await save('comments', { ...c, deleted_at: new Date().toISOString() });
  };

  return (
    <View style={{ gap: 10 }}>
      {sorted.length ? (
        sorted.map((c) => <CommentRow key={c.id} item={c} who={nameOf(c.user_id)} onRemove={c.user_id === me.id ? () => void remove(c) : undefined} />)
      ) : (
        <Text style={styles.empty}>No comments yet.</Text>
      )}
      {canAdd ? (
        <View style={{ gap: 8 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Add a comment for the team…"
            placeholderTextColor={Colors.textTertiary}
            accessibilityLabel="Comment"
            multiline
            style={styles.input}
          />
          <Button title="Post comment" icon="chatbubble-outline" variant="secondary" onPress={() => void send()} disabled={!text.trim()} />
        </View>
      ) : null}
    </View>
  );
}

function CommentRow({ item, who, onRemove }: { item: Comment; who: string; onRemove?: () => void }) {
  const pending = useIsPending('comments', item.id);
  const when = item.created_at ? new Date(item.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  return (
    <View style={styles.comment}>
      <View style={styles.head}>
        <Text style={styles.who}>{who}</Text>
        <Text style={styles.when}>{when}</Text>
        {pending ? <Pill text="Waiting to send" /> : null}
        {onRemove ? (
          <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel="Remove comment" hitSlop={8} style={{ marginLeft: 'auto' }}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.body}>{item.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: Fonts.regular, fontSize: 14, color: Colors.textSecondary },
  comment: { backgroundColor: Colors.field, borderRadius: 8, padding: 12, gap: 4, borderWidth: 1, borderColor: Colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  who: { fontFamily: Fonts.semibold, fontSize: 14, color: Colors.text },
  when: { fontFamily: Fonts.regular, fontSize: 12.5, color: Colors.textTertiary },
  remove: { fontFamily: Fonts.semibold, fontSize: 13, color: Colors.danger },
  body: { fontFamily: Fonts.regular, fontSize: 15, color: Colors.text, lineHeight: 21 },
  input: {
    backgroundColor: Colors.field,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    minHeight: 70,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: Colors.text,
    textAlignVertical: 'top',
  },
});
