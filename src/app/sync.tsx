import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, CommandBar, Notice, SectionBar } from '@/components/ui';
import { CONFLICT_MESSAGE, describeConflict, describeRow } from '@/data/conflicts';
import { useData, useSyncState, useTable } from '@/data/DataProvider';
import { TableName } from '@/data/schema';
import { confirm } from '@/lib/confirm';
import Colors, { Fonts } from '@/theme/colors';

const TABLE_LABELS: Partial<Record<TableName, string>> = {
  time_entries: 'Hours entry',
  comments: 'Comment',
  attachments: 'Photo / file',
  profiles: 'Account change',
  jobs: 'Job',
  tasks: 'Task',
  phases: 'Phase',
  job_members: 'Job assignment',
};

function when(iso: string | null) {
  if (!iso) return 'Not yet';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' });
}

export default function SyncScreen() {
  const { engine, store } = useData();
  const s = useSyncState();
  const rejected = store.rejectedItems();
  const tasks = useTable('tasks');
  const look = { taskName: (id: string) => tasks.find((t) => t.id === id)?.name };

  const status =
    s.phase === 'offline'
      ? 'No signal right now. Everything you do is saved on this device and will send automatically when signal is back.'
      : s.phase === 'signed-out'
        ? 'Your sign-in has expired. Sign out and back in — nothing on this device will be lost.'
        : s.phase === 'syncing'
          ? 'Syncing now…'
          : s.pending
            ? 'Waiting to send.'
            : 'Everything on this device is saved to the server.';

  return (
    <View style={styles.screen}>
      <CommandBar title="Sync" back />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.block}>
          <Notice tone={s.phase === 'offline' || s.pending ? 'warn' : s.phase === 'signed-out' ? 'bad' : 'ok'}>
            {status}
          </Notice>
          <Row label="Waiting to send" value={String(s.pending)} />
          <Row label="Last synced" value={when(s.lastSyncedAt)} />
          {s.lastError ? <Row label="Last problem" value={s.lastError} /> : null}
          <Button
            title="Sync now"
            icon="sync-outline"
            loading={s.phase === 'syncing'}
            onPress={() => void engine.sync()}
          />
        </View>

        {rejected.length ? (
          <>
            <SectionBar title={`Not saved · ${rejected.length}`} />
            <View style={styles.block}>
              <Text style={styles.help}>
                These changes weren’t saved on the server. Each one is kept here, so nothing disappears without you
                knowing.
              </Text>
              {rejected.map((item) => {
                const what = describeRow(item.table, item.row as unknown as Record<string, unknown>, look);
                const clash = !!item.theirs && !!item.base && item.rejected === CONFLICT_MESSAGE;
                const lines = clash
                  ? describeConflict(
                      item.table,
                      item.row as unknown as Record<string, unknown>,
                      item.base as unknown as Record<string, unknown>,
                      item.theirs as unknown as Record<string, unknown>,
                      look,
                    )
                  : [];
                return (
                  <View key={item.seq} style={styles.rejected}>
                    <Text style={styles.rejectedTitle}>
                      {TABLE_LABELS[item.table] ?? item.table} · {when(item.queuedAt)}
                    </Text>
                    {what ? <Text style={styles.rejectedWhat}>{what}</Text> : null}
                    <Text style={styles.rejectedReason}>{item.rejected}</Text>
                    {clash ? (
                      <>
                        {lines.map((l) => (
                          <Text key={l.field} style={styles.clashLine}>
                            {l.label}: you changed it to <Text style={styles.bold}>{l.mine}</Text>, it is now{' '}
                            <Text style={styles.bold}>{l.theirs}</Text>
                          </Text>
                        ))}
                        <Text style={styles.help}>
                          Your change hasn’t been applied, so nothing was overwritten.
                          {item.table === 'time_entries'
                            ? ' If you use yours, both versions stay in the entry’s history.'
                            : ''}
                        </Text>
                        <Button
                          title="Keep what’s there now"
                          onPress={async () => {
                            await store.resolveConflict(item.seq, 'theirs');
                            void engine.sync();
                          }}
                        />
                        <Button
                          title="Use my version instead"
                          variant="secondary"
                          onPress={async () => {
                            await store.resolveConflict(item.seq, 'mine');
                            void engine.sync();
                          }}
                        />
                      </>
                    ) : (
                      <Button
                        title="Discard"
                        variant="danger"
                        onPress={async () => {
                          if (await confirm('Discard this change?', 'It will be removed from this device.', 'Discard')) {
                            await store.discard(item.seq);
                            void engine.sync();
                          }
                        }}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  block: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontFamily: Fonts.medium, fontSize: 15, color: Colors.textSecondary },
  rowValue: { fontFamily: Fonts.semibold, fontSize: 15, color: Colors.text, flexShrink: 1, textAlign: 'right' },
  help: { fontFamily: Fonts.regular, fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  rejected: {
    backgroundColor: Colors.field,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 8,
  },
  rejectedTitle: { fontFamily: Fonts.semibold, fontSize: 15, color: Colors.text },
  rejectedWhat: { fontFamily: Fonts.medium, fontSize: 14, color: Colors.text },
  clashLine: { fontFamily: Fonts.regular, fontSize: 14, color: Colors.text, lineHeight: 20 },
  bold: { fontFamily: Fonts.bold },
  rejectedReason: { fontFamily: Fonts.regular, fontSize: 14, color: Colors.danger },
});
