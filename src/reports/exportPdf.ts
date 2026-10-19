// Making and sending the report PDF on phones: expo-print turns the HTML into
// a PDF, then the phone's share sheet (Mail, Files, Teams…) takes it.
// The web version is exportPdf.web.ts.

import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { ReportDoc } from './document';
import { reportHtml } from './html';

export interface PreparedPdf {
  uri: string;
  name: string;
}

export async function preparePdf(doc: ReportDoc, fileName: string): Promise<PreparedPdf> {
  const { uri } = await Print.printToFileAsync({ html: reportHtml(doc), width: 595, height: 842 }); // A4
  // Give it a readable name for the person receiving it.
  const named = new File(Paths.cache, fileName);
  if (named.exists) named.delete();
  new File(uri).move(named);
  return { uri: named.uri, name: fileName };
}

export async function canSharePdf(): Promise<boolean> {
  return Sharing.isAvailableAsync();
}

// Returns false if this device can't share.
export async function sharePdf(p: PreparedPdf): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(p.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: p.name });
  return true;
}

// On phones, "save" is the same share sheet (it has "Save to Files").
export async function savePdf(p: PreparedPdf): Promise<void> {
  await sharePdf(p);
}
