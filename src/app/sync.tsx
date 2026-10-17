import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, CommandBar, Notice, SectionBar } from '@/components/ui';
import { useData, useSyncState } from '@/data/DataProvider';
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
            <SectionBar title={`Not accepted by the server · ${rejected.length}`} />
            <View style={styles.block}>
              <Text style={styles.help}>
                These changes were refused — usually because the job was closed or you were taken off it. They are
                kept here so nothing disappears without you knowing. Tell your PM, then discard them.
              </Text>
              {rejected.map((item) => (
                <View key={item.seq} style={styles.rejected}>
                  <Text style={styles.rejectedTitle}>
                    {TABLE_LABELS[item.table] ?? item.table} · {when(item.queuedAt)}
                  </Text>
                  <Text style={styles.rejectedReason}>{item.rejected}</Text>
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
                </View>
              ))}
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
  rejectedReason: { fontFamily: Fonts.regular, fontSize: 14, color: Colors.danger },
});
