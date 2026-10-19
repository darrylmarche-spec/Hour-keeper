// Moving attachment files between this device and Supabase Storage.

import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyError } from '@/data/remote';
import { Attachment } from '@/data/schema';
import { RemoteError } from '@/data/sync';
import { fileUrl, getFile, putFile } from './fileCache';
import { BUCKET } from './naming';

// Sends the file for a new attachment. Called by the sync engine just before
// the attachment's row, so a row never reaches the server without its file.
export async function uploadAttachmentFile(client: SupabaseClient, row: Attachment): Promise<void> {
  const bytes = await getFile(row.id);
  if (!bytes) {
    throw new RemoteError('rejected', `The file “${row.file_name}” is no longer on this device, so it can’t be sent.`);
  }
  let res;
  try {
    res = await client.storage
      .from(BUCKET)
      .upload(row.storage_path, bytes, { contentType: row.mime_type || 'application/octet-stream', upsert: true });
  } catch (e) {
    throw classifyError(e);
  }
  if (res.error) {
    const status = Number((res.error as { statusCode?: string | number }).statusCode) || undefined;
    throw classifyError(res.error, status);
  }
}

// A URL to show or open the file: the copy on this device if there is one,
// otherwise a short-lived link from the server (saved on the device as well,
// so it opens offline next time). Null when it isn't here and there's no signal.
export async function attachmentUrl(client: SupabaseClient, row: Attachment): Promise<string | null> {
  const local = await fileUrl(row.id).catch(() => null);
  if (local) return local;
  try {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(row.storage_path, 300);
    if (error || !data) return null;
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    await putFile(row.id, await res.arrayBuffer(), row.mime_type);
    return await fileUrl(row.id);
  } catch {
    return null;
  }
}
