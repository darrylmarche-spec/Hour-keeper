import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { PickedFile } from './readTaskFile';

const TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/comma-separated-values',
  'application/pdf',
  'application/vnd.ms-excel',
];

// Ask the person for a task sheet. Returns null if they cancel.
export async function pickTaskFile(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: Platform.OS === 'web' ? ['.xlsx', '.csv', '.pdf', '.xls', ...TYPES] : TYPES,
    copyToCacheDirectory: true,
    multiple: false,
    base64: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];

  let bytes: ArrayBuffer;
  if (Platform.OS === 'web' && asset.file) {
    bytes = await asset.file.arrayBuffer();
  } else {
    const { File } = await import('expo-file-system');
    bytes = await new File(asset.uri).arrayBuffer();
  }
  return { name: asset.name, mimeType: asset.mimeType, bytes };
}
