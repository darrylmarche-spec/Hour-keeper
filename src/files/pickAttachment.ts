// Taking a photo, choosing photos, or choosing a file to attach to a job.
// Photos are shrunk before saving so they upload quickly on site signal.

import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

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

async function shrinkPhoto(asset: ImagePicker.ImagePickerAsset): Promise<NewFile> {
  const base = (asset.fileName || `photo-${Date.now()}`).replace(/\.[^.]+$/, '');
  try {
    let { width, height } = asset;
    if (!width || !height) {
      const probe = await ImageManipulator.manipulate(asset.uri).renderAsync();
      ({ width, height } = probe);
    }
    const ctx = ImageManipulator.manipulate(asset.uri);
    // Both sides are given: on web a missing height isn't worked out for you.
    if (width > MAX_PHOTO_WIDTH) ctx.resize({ width: MAX_PHOTO_WIDTH, height: Math.round((height * MAX_PHOTO_WIDTH) / width) });
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
    return { name: `${base}.jpg`, mimeType: 'image/jpeg', bytes: await readBytes(saved.uri) };
  } catch {
    // Couldn't shrink it (unusual format) — keep the original.
    return {
      name: asset.fileName || `${base}.jpg`,
      mimeType: asset.mimeType || 'image/jpeg',
      bytes: await readBytes(asset.uri, asset.file),
    };
  }
}

export async function takePhoto(): Promise<NewFile[]> {
  if (Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('camera-permission');
  }
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 1 });
  if (res.canceled || !res.assets) return [];
  return Promise.all(res.assets.map(shrinkPhoto));
}

export async function pickPhotos(): Promise<NewFile[]> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsMultipleSelection: true, quality: 1 });
  if (res.canceled || !res.assets) return [];
  return Promise.all(res.assets.map(shrinkPhoto));
}

export async function pickDocuments(): Promise<NewFile[]> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return [];
  return Promise.all(
    res.assets.map(async (a) => ({
      name: a.name,
      mimeType: a.mimeType || 'application/octet-stream',
      bytes: await readBytes(a.uri, Platform.OS === 'web' ? a.file : null),
    })),
  );
}
