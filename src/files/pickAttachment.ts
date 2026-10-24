// Taking a photo, choosing photos, or choosing a file to attach to a job.
// Photos are shrunk and cleaned of hidden data (like GPS location) before saving.

import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { looksLikeImage, stripJpegMetadata } from './imageClean';

export interface NewFile {
  name: string;
  mimeType: string;
  bytes: ArrayBuffer;
}

const MAX_PHOTO_WIDTH = 1600;

async function readBytes(uri: string, file?: Blob | null): Promise<ArrayBuffer> {
  if (file) return file.arrayBuffer();
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  const { File } = await import('expo-file-system');
  return new File(uri).arrayBuffer();
}

// Every image goes through here, whichever way it was added (camera, photo
// library, or the file picker). The photo is shrunk, and hidden data (GPS
// location, camera, time) is removed before it can leave the device.
// An image that can't be cleaned is never uploaded: null means "skip it".
interface ImageSource {
  uri: string;
  file?: Blob | null;
  name?: string | null;
  width?: number;
  height?: number;
}

async function prepareImage(src: ImageSource): Promise<NewFile | null> {
  const base = (src.name || `photo-${Date.now()}`).replace(/\.[^.]+$/, '');
  try {
    let { width, height } = src;
    if (!width || !height) {
      const probe = await ImageManipulator.manipulate(src.uri).renderAsync();
      ({ width, height } = probe);
    }
    const ctx = ImageManipulator.manipulate(src.uri);
    // Both sides are given: on web a missing height isn't worked out for you.
    if (width > MAX_PHOTO_WIDTH) ctx.resize({ width: MAX_PHOTO_WIDTH, height: Math.round((height * MAX_PHOTO_WIDTH) / width) });
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
    // The re-save normally drops hidden data already; clean again so it never depends on that.
    const cleaned = stripJpegMetadata(new Uint8Array(await readBytes(saved.uri)));
    if (cleaned) return { name: `${base}.jpg`, mimeType: 'image/jpeg', bytes: toBuffer(cleaned.bytes) };
  } catch {
    // Couldn't shrink it. A JPEG can still be cleaned as it is.
  }
  try {
    const original = await readBytes(src.uri, src.file);
    const cleaned = stripJpegMetadata(new Uint8Array(original));
    if (cleaned) return { name: `${base}.jpg`, mimeType: 'image/jpeg', bytes: toBuffer(cleaned.bytes) };
  } catch {
    // fall through
  }
  return null;
}

function toBuffer(b: Uint8Array): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

export interface PickResult {
  files: NewFile[];
  // Names of images that couldn't be prepared and so were not added.
  skipped: string[];
}

async function prepareImages(assets: ImagePicker.ImagePickerAsset[]): Promise<PickResult> {
  const files: NewFile[] = [];
  const skipped: string[] = [];
  for (const a of assets) {
    const f = await prepareImage({ uri: a.uri, file: a.file, name: a.fileName, width: a.width, height: a.height });
    if (f) files.push(f);
    else skipped.push(a.fileName || 'a photo');
  }
  return { files, skipped };
}

export async function takePhoto(): Promise<PickResult> {
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('camera-permission');
  }
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 1 });
  if (res.canceled || !res.assets) return { files: [], skipped: [] };
  return prepareImages(res.assets);
}

export async function pickPhotos(): Promise<PickResult> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsMultipleSelection: true, quality: 1 });
  if (res.canceled || !res.assets) return { files: [], skipped: [] };
  return prepareImages(res.assets);
}

export async function pickDocuments(): Promise<PickResult> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return { files: [], skipped: [] };
  const files: NewFile[] = [];
  const skipped: string[] = [];
  for (const a of res.assets) {
    const mimeType = a.mimeType || 'application/octet-stream';
    if (looksLikeImage(mimeType, a.name)) {
      // A photo added as a "file" gets the same treatment as one from the camera.
      const f = await prepareImage({ uri: a.uri, file: Platform.OS === 'web' ? a.file : null, name: a.name });
      if (f) files.push(f);
      else skipped.push(a.name);
    } else {
      files.push({ name: a.name, mimeType, bytes: await readBytes(a.uri, Platform.OS === 'web' ? a.file : null) });
    }
  }
  return { files, skipped };
}
