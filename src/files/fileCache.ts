// Files kept on this device (phone / tablet): photos and documents waiting to
// upload, and ones already viewed, so they open with no signal.
// The web version is fileCache.web.ts.

import { Directory, File, Paths } from 'expo-file-system';

function folder(): Directory {
  const dir = new Directory(Paths.document, 'attachments');
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

export async function putFile(key: string, bytes: ArrayBuffer, _mimeType: string): Promise<void> {
  const file = new File(folder(), key);
  if (file.exists) file.delete();
  file.create();
  await file.write(new Uint8Array(bytes));
}

export async function getFile(key: string): Promise<ArrayBuffer | null> {
  const file = new File(folder(), key);
  return file.exists ? file.arrayBuffer() : null;
}

// Something an <Image> or the share sheet can open, or null if not on this device.
export async function fileUrl(key: string): Promise<string | null> {
  const file = new File(folder(), key);
  return file.exists ? file.uri : null;
}
