// Web version of exportPdf.ts. The PDF is drawn in the page (jsPDF) and then
// handed to the phone's share sheet where the browser allows it, or saved as a
// download — the app stays open either way (no new windows or tabs).

import { ReportDoc } from './document';
import { renderPdf } from './pdfWeb';

export interface PreparedPdf {
  blob: Blob;
  name: string;
}

export async function preparePdf(doc: ReportDoc, fileName: string): Promise<PreparedPdf> {
  return { blob: await renderPdf(doc), name: fileName };
}

function asFile(p: PreparedPdf): File {
  return new File([p.blob], p.name, { type: 'application/pdf' });
}

export async function canSharePdf(): Promise<boolean> {
  try {
    const probe = new File([new Blob(['x'])], 'x.pdf', { type: 'application/pdf' });
    return typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

// Must run straight from a tap (browsers only allow sharing then), which is
// why the PDF is prepared before the button is pressed.
export async function sharePdf(p: PreparedPdf): Promise<boolean> {
  const file = asFile(p);
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title: p.name.replace(/\.pdf$/, '') });
  } catch (e) {
    // Closing the share sheet isn't an error.
    if (!(e instanceof DOMException && e.name === 'AbortError')) throw e;
  }
  return true;
}

export async function savePdf(p: PreparedPdf): Promise<void> {
  const url = URL.createObjectURL(p.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = p.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
