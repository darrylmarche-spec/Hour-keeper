import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Image, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Notice } from '@/components/ui';
import { newId, useIsPending, useMe, useSaveMany } from '@/data/DataProvider';
import { Attachment, Job } from '@/data/schema';
import { attachmentUrl } from '@/files/attachments';
import { putFile } from '@/files/fileCache';
import { formatBytes, isImage, storagePath } from '@/files/naming';
import { NewFile, pickDocuments, pickPhotos, takePhoto } from '@/files/pickAttachment';
import { confirm } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import Colors, { Fonts } from '@/theme/colors';

const MAX_BYTES = 25 * 1024 * 1024;

// Photos and files on a task. Added files are kept on the device straight
// away and sent with the next sync, so they work with no signal.
export function Attachments({
  job,
  taskId,
  items,
  canAdd,
}: {
  job: Job;
  taskId: string | null;
  items: readonly Attachment[];
  canAdd: boolean;
}) {
  const me = useMe()!;
  const saveMany = useSaveMany();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Attachment | null>(null);

  const add = async (label: string, pick: () => Promise<NewFile[]>) => {
    setError(null);
    let files: NewFile[];
    try {
      files = await pick();
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'camera-permission'
          ? 'Hour Keeper needs camera access to take photos. You can allow it in your phone’s Settings.'
          : 'That couldn’t be added. Try again, or choose a different file.',
      );
      return;
    }
    if (!files.length) return;
    const tooBig = files.filter((f) => f.bytes.byteLength > MAX_BYTES);
    const ok = files.filter((f) => f.bytes.byteLength <= MAX_BYTES);
    if (tooBig.length) setError(`${tooBig.map((f) => f.name).join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} over 25 MB and wasn’t added.`);
    setBusy(label);
    try {
      const rows: Attachment[] = [];
      for (const f of ok) {
        const id = newId();
        await putFile(id, f.bytes, f.mimeType);
        rows.push({
          id,
          job_id: job.id,
          task_id: taskId,
          time_entry_id: null,
          user_id: me.id,
          storage_path: storagePath(job.id, id, f.name),
          file_name: f.name,
          mime_type: f.mimeType,
          size_bytes: f.bytes.byteLength,
          created_at: new Date().toISOString(),
        });
      }
      await saveMany(rows.map((row) => ({ table: 'attachments' as const, row })));
    } catch {
      setError('There wasn’t room to save that on this device. Free up some space and try again.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (a: Attachment) => {
    if (!(await confirm(`Remove “${a.file_name}”?`, 'It will no longer show on this job.', 'Remove'))) return;
    await saveMany([{ table: 'attachments', row: { ...a, deleted_at: new Date().toISOString() } }]);
    setViewing(null);
  };

  const sorted = [...items].sort((a, b) => (b.created_at ?? '~').localeCompare(a.created_at ?? '~'));

  return (
    <View style={{ gap: 10 }}>
      {sorted.length ? (
        <View style={styles.grid}>
          {sorted.map((a) => (
            <Tile key={a.id} item={a} onPress={() => setViewing(a)} />
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>No photos or files yet.</Text>
      )}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {canAdd ? (
        <View style={styles.buttons}>
          <Button title="Camera" icon="camera-outline" onPress={() => void add('camera', takePhoto)} loading={busy === 'camera'} style={styles.btn} />
          <Button title="Photos" icon="images-outline" variant="secondary" onPress={() => void add('photos', pickPhotos)} loading={busy === 'photos'} style={styles.btn} />
          <Button title="File" icon="document-attach-outline" variant="secondary" onPress={() => void add('file', pickDocuments)} loading={busy === 'file'} style={styles.btn} />
        </View>
      ) : null}

      <Viewer
        item={viewing}
        onClose={() => setViewing(null)}
        onRemove={viewing && viewing.user_id === me.id ? () => void remove(viewing) : undefined}
      />
    </View>
  );
}

// undefined while looking, null when the file can't be reached.
function useUrl(item: Attachment | null) {
  const [found, setFound] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    if (item) void attachmentUrl(supabase, item).then((url) => live && setFound({ id: item.id, url }));
    return () => {
      live = false;
    };
  }, [item]);
  return item && found?.id === item.id ? found.url : undefined;
}

function Tile({ item, onPress }: { item: Attachment; onPress: () => void }) {
  const image = isImage(item.mime_type);
  const url = useUrl(image ? item : null);
  const pending = useIsPending('attachments', item.id);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={item.file_name} style={styles.tile}>
      {image && url ? (
        <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.fileThumb]}>
          <Ionicons name={image ? 'image-outline' : 'document-outline'} size={28} color={Colors.textTertiary} />
          {!image ? (
            <Text style={styles.fileName} numberOfLines={2}>
              {item.file_name}
            </Text>
          ) : null}
        </View>
      )}
      {pending ? (
        <View style={styles.badge}>
          <Ionicons name="cloud-upload-outline" size={12} color={Colors.textOnDark} />
          <Text style={styles.badgeText}>Waiting</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function Viewer({ item, onClose, onRemove }: { item: Attachment | null; onClose: () => void; onRemove?: () => void }) {
  const insets = useSafeAreaInsets();
  const url = useUrl(item);
  const open = () => {
    if (!url) return;
    if (Platform.OS === 'web') window.open(url, '_blank');
    else void Linking.openURL(url);
  };
  return (
    <Modal visible={!!item} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.viewer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.viewerBar}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={styles.viewerClose}>
            <Ionicons name="close" size={26} color={Colors.textOnDark} />
            <Text style={styles.viewerCloseText}>Close</Text>
          </Pressable>
        </View>
        <View style={styles.viewerBody}>
          {!item ? null : url === undefined ? (
            <Text style={styles.viewerText}>Loading…</Text>
          ) : url === null ? (
            <Text style={styles.viewerText}>This file isn’t on this device yet. It will open once you have signal.</Text>
          ) : isImage(item.mime_type) ? (
            <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          ) : (
            <View style={{ alignItems: 'center', gap: 12 }}>
              <Ionicons name="document-outline" size={56} color={Colors.textOnDarkMuted} />
              <Text style={styles.viewerText}>{item.file_name}</Text>
              <Button title="Open file" icon="open-outline" onPress={open} style={{ minWidth: 200 }} />
            </View>
          )}
        </View>
        {item ? (
          <View style={styles.viewerFooter}>
            <Text style={styles.viewerMeta} numberOfLines={1}>
              {item.file_name} · {formatBytes(Number(item.size_bytes))}
            </Text>
            {onRemove ? <Button title="Remove" variant="danger" icon="trash-outline" onPress={onRemove} /> : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: 104, height: 104, borderRadius: 8, overflow: 'hidden', backgroundColor: Colors.field },
  thumb: { width: '100%', height: '100%' },
  fileThumb: { alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6, borderWidth: 1, borderColor: Colors.border, borderRadius: 8 },
  fileName: { fontFamily: Fonts.medium, fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
  badge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.warningDark,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: { fontFamily: Fonts.semibold, fontSize: 10.5, color: Colors.textOnDark },
  empty: { fontFamily: Fonts.regular, fontSize: 14, color: Colors.textSecondary },
  buttons: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, paddingHorizontal: 8 },
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerBar: { flexDirection: 'row', paddingHorizontal: 12 },
  viewerClose: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 },
  viewerCloseText: { fontFamily: Fonts.semibold, fontSize: 16, color: Colors.textOnDark },
  viewerBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
  viewerText: { fontFamily: Fonts.medium, fontSize: 15, color: Colors.textOnDark, textAlign: 'center', maxWidth: 320 },
  viewerFooter: { paddingHorizontal: 16, gap: 10 },
  viewerMeta: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.textOnDarkMuted },
});
