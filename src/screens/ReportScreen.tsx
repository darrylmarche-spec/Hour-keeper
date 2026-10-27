import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DocTableView } from '@/components/DocTableView';
import { Button, CommandBar, EmptyState, goBackOrHome, Notice } from '@/components/ui';
import { useBudgets, useMe, useRow, useTable } from '@/data/DataProvider';
import { seesPercentages, seesSoldHours } from '@/lib/roles';
import { pdfName, reportDoc } from '@/reports/document';
import { canSharePdf, preparePdf, PreparedPdf, savePdf, sharePdf } from '@/reports/exportPdf';
import { buildJobReport } from '@/reports/jobReport';
import Colors, { Fonts } from '@/theme/colors';

// A job's sold vs actual report — an ordinary screen with a back button and
// the tab bar underneath, never a separate window.
export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe()!;
  const job = useRow('jobs', id);
  const phases = useTable('phases');
  const tasks = useTable('tasks');
  const entries = useTable('time_entries');
  const profiles = useTable('profiles');
  const comments = useTable('comments');
  const attachments = useTable('attachments');
  const showPercent = seesPercentages(me.role);
  const { soldByTask } = useBudgets();
  const sold = seesSoldHours(me.role);

  const doc = useMemo(
    () =>
      job
        ? reportDoc(
            buildJobReport({
              job,
              phases,
              tasks,
              soldByTask: sold ? soldByTask : undefined,
              entries,
              profiles,
              comments,
              attachments,
              viewerId: me.id,
              // A tech sees their own hours, not a list of their colleagues'.
              peopleScope: me.role === 'tech' ? 'self' : 'all',
            }),
            { showPercent },
          )
        : null,
    [job, phases, tasks, soldByTask, sold, entries, profiles, comments, attachments, showPercent, me.id, me.role],
  );

  // The PDF is made ahead of time so Share works straight from the tap
  // (browsers only allow sharing directly from one).
  const [made, setMade] = useState<{ doc: unknown; pdf: PreparedPdf | null; error?: boolean } | null>(null);
  const [shareable, setShareable] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!doc || !job) return;
    let live = true;
    const t = setTimeout(() => {
      preparePdf(doc, pdfName(job.name, job.job_number))
        .then((pdf) => live && setMade({ doc, pdf }))
        .catch(() => live && setMade({ doc, pdf: null, error: true }));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [doc, job]);
  useEffect(() => {
    void canSharePdf().then(setShareable);
  }, []);
  const pdf = made?.doc === doc ? made.pdf : null;
  const failed = made?.doc === doc && made.error;

  if (!job || !doc) {
    return (
      <View style={styles.screen}>
        <CommandBar title="Report" back />
        <EmptyState icon="search-outline" title="Job not found" message="It may have been removed, or you’re no longer on it.">
          <Button title="Back" onPress={goBackOrHome} style={{ minWidth: 200 }} />
        </EmptyState>
      </View>
    );
  }

  const share = async () => {
    if (!pdf) return;
    setMessage(null);
    try {
      if (!(await sharePdf(pdf))) {
        await savePdf(pdf);
        setMessage('Sharing isn’t available here, so the PDF was saved to your downloads instead.');
      }
    } catch {
      setMessage('The PDF couldn’t be shared. Try “Save PDF” instead.');
    }
  };
  const save = async () => {
    if (!pdf) return;
    setMessage(null);
    await savePdf(pdf);
    if (Platform.OS === 'web') setMessage('Saved to your downloads.');
  };

  return (
    <View style={styles.screen}>
      <CommandBar title="Report" subtitle={job.name} back />
      <View style={styles.actions}>
        {Platform.OS !== 'web' || shareable ? (
          <Button title="Share PDF" icon="share-outline" onPress={() => void share()} loading={!pdf && !failed} disabled={!pdf} style={{ flex: 1 }} />
        ) : null}
        {Platform.OS === 'web' ? (
          <Button
            title="Save PDF"
            icon="download-outline"
            variant={shareable ? 'secondary' : 'primary'}
            onPress={() => void save()}
            loading={!pdf && !failed}
            disabled={!pdf}
            style={{ flex: 1 }}
          />
        ) : null}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {failed ? (
          <View style={styles.pad}>
            <Notice tone="bad">The PDF couldn’t be made on this device. The report below is still up to date.</Notice>
          </View>
        ) : null}
        {message ? (
          <View style={styles.pad}>
            <Notice tone="ok">{message}</Notice>
          </View>
        ) : null}
        <View style={styles.summary}>
          {doc.summary.map(([k, v]) => (
            <View key={k} style={styles.stat}>
              <Text style={styles.statLabel}>{k}</Text>
              <Text style={[styles.statValue, k === 'Over' && { color: Colors.danger }]}>{v.replace(' hrs', '')}</Text>
            </View>
          ))}
        </View>
        <View style={styles.details}>
          {doc.details.map(([k, v]) => (
            <View key={k} style={styles.detail}>
              <Text style={styles.detailKey}>{k}</Text>
              <Text style={styles.detailValue}>{v}</Text>
            </View>
          ))}
        </View>
        {doc.tables.map((t) => (
          <DocTableView key={t.heading} table={t} />
        ))}
        <Text style={styles.footer}>
          Hours shown are what has reached this {Platform.OS === 'web' ? 'device' : 'phone'}.
          {showPercent ? '' : ' Percentages are on the PM’s copy.'}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  pad: { paddingHorizontal: 16, paddingTop: 12 },
  actions: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: Colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: Colors.border },
  summary: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border },
  stat: { flex: 1, paddingVertical: 12, alignItems: 'center', gap: 2 },
  statLabel: { fontFamily: Fonts.semibold, fontSize: 11, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontFamily: Fonts.bold, fontSize: 22, color: Colors.text },
  details: { padding: 16, gap: 6 },
  detail: { flexDirection: 'row', gap: 12 },
  detailKey: { width: 110, fontFamily: Fonts.medium, fontSize: 13.5, color: Colors.textSecondary },
  detailValue: { flex: 1, fontFamily: Fonts.medium, fontSize: 13.5, color: Colors.text },
  footer: { fontFamily: Fonts.regular, fontSize: 12.5, color: Colors.textTertiary, textAlign: 'center', marginTop: 16, paddingHorizontal: 16 },
});
