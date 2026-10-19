import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { Button, CommandBar, EmptyState, Field } from '@/components/ui';
import { useMe, useSave, useTable } from '@/data/DataProvider';
import { Template } from '@/data/schema';
import { formatHours } from '@/data/totals';
import { confirm } from '@/lib/confirm';
import { managesJobs } from '@/lib/roles';
import Colors, { Fonts } from '@/theme/colors';

export default function TemplatesScreen() {
  const me = useMe()!;
  const templates = useTable('templates');
  const tTasks = useTable('template_tasks');
  const save = useSave();
  const [renaming, setRenaming] = useState<Template | null>(null);
  const [name, setName] = useState('');

  const rows = useMemo(
    () =>
      [...templates]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => {
          const tasks = tTasks.filter((x) => x.template_id === t.id);
          return { t, count: tasks.length, hours: tasks.reduce((s, x) => s + Number(x.sold_hours), 0) };
        }),
    [templates, tTasks],
  );

  if (!managesJobs(me.role)) {
    return (
      <View style={styles.screen}>
        <CommandBar title="Templates" back />
        <EmptyState icon="lock-closed-outline" title="Only PMs, supervisors and admins can manage templates" />
      </View>
    );
  }

  const remove = async (t: Template) => {
    if (!(await confirm(`Remove “${t.name}”?`, 'Jobs already made from it aren’t affected.', 'Remove'))) return;
    await save('templates', { ...t, deleted_at: new Date().toISOString() });
  };

  return (
    <View style={styles.screen}>
      <CommandBar title="Templates" subtitle="Starting task lists for new jobs" back />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {rows.length ? (
          rows.map(({ t, count, hours }) => (
            <View key={t.id} style={styles.card}>
              <Text style={styles.name}>{t.name}</Text>
              <Text style={styles.meta}>
                {count} tasks · {formatHours(hours)} sold hours
              </Text>
              <View style={styles.actions}>
                <Button
                  title="Rename"
                  variant="secondary"
                  onPress={() => {
                    setName(t.name);
                    setRenaming(t);
                  }}
                  style={{ flex: 1 }}
                />
                <Button title="Remove" variant="danger" onPress={() => void remove(t)} style={{ flex: 1 }} />
              </View>
            </View>
          ))
        ) : (
          <EmptyState
            icon="copy-outline"
            title="No templates"
            message="Open any job and choose “Save as template” to reuse its task list."
          />
        )}
        <Text style={styles.help}>To add a template, open a job and choose “Save as template”.</Text>
      </ScrollView>

      <Sheet visible={!!renaming} title="Rename template" onClose={() => setRenaming(null)}>
        <Field label="Template name" value={name} onChangeText={setName} autoFocus />
        <Button
          title="Save"
          icon="checkmark"
          disabled={!name.trim()}
          onPress={async () => {
            if (renaming) await save('templates', { ...renaming, name: name.trim() });
            setRenaming(null);
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  card: { padding: 16, gap: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  name: { fontFamily: Fonts.semibold, fontSize: 16, color: Colors.text },
  meta: { fontFamily: Fonts.regular, fontSize: 13.5, color: Colors.textSecondary },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  help: { padding: 16, fontFamily: Fonts.regular, fontSize: 13, color: Colors.textTertiary, textAlign: 'center' },
});
