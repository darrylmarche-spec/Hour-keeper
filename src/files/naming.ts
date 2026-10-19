// Where an attachment's file lives in storage: {job}/{attachment}/{name}.
// The job comes first so the server's access rules can check it.

export const BUCKET = 'attachments';

export function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(-80);
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : 'file';
}

export function storagePath(jobId: string, attachmentId: string, fileName: string): string {
  return `${jobId}/${attachmentId}/${safeFileName(fileName)}`;
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
