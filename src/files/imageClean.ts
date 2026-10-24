// Removes location and other hidden data from a JPEG before it leaves the
// device. Phone cameras write GPS coordinates (and the make, model and time)
// inside each photo; reaching the office, that would be location tracking by
// accident.
//
// Only the picture itself is kept, plus two things the picture needs to look
// right: the colour profile, and which way up it is. Everything else goes:
// EXIF (including GPS and the embedded thumbnail), XMP, IPTC, comments, and
// any extra data after the end of the image (some phones append a second
// image or a video there). The picture data isn't touched, so nothing is
// re-compressed and quality doesn't change.

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP14 = 0xee;

const JFIF = [0x4a, 0x46, 0x49, 0x46, 0x00]; // "JFIF\0"
const ICC = [0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00]; // "ICC_PROFILE\0"
const ADOBE = [0x41, 0x64, 0x6f, 0x62, 0x65]; // "Adobe" (colour transform for some JPEGs)
const EXIF_ID = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

function startsWith(b: Uint8Array, at: number, id: number[]): boolean {
  if (at + id.length > b.length) return false;
  for (let i = 0; i < id.length; i++) if (b[at + i] !== id[i]) return false;
  return true;
}

// The EXIF "Orientation" value (1-8) if the photo has one, else 1.
export function readOrientation(b: Uint8Array, segStart: number, segEnd: number): number {
  // segStart points at "Exif\0\0"; the TIFF block follows.
  const t = segStart + 6;
  if (t + 8 > segEnd) return 1;
  const little = b[t] === 0x49 && b[t + 1] === 0x49;
  const big = b[t] === 0x4d && b[t + 1] === 0x4d;
  if (!little && !big) return 1;
  const u16 = (o: number) => (little ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) =>
    little
      ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
      : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  if (u16(t + 2) !== 42) return 1;
  const ifd = t + u32(t + 4);
  if (ifd + 2 > segEnd) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > segEnd) return 1;
    if (u16(e) === 0x0112 && u16(e + 2) === 3) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

// A minimal EXIF block that says only which way up the photo is.
function orientationSegment(orientation: number): Uint8Array {
  const tiff = [
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian header, IFD at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT, 1 value
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ];
  const body = [...EXIF_ID, ...tiff];
  const len = body.length + 2;
  return Uint8Array.of(0xff, APP1, (len >> 8) & 0xff, len & 0xff, ...body);
}

export interface CleanResult {
  bytes: Uint8Array;
  orientation: number;
}

// Returns the cleaned JPEG, or null if the bytes aren't a readable JPEG.
export function stripJpegMetadata(input: Uint8Array): CleanResult | null {
  const b = input;
  if (b.length < 4 || b[0] !== 0xff || b[1] !== SOI) return null;

  const kept: Uint8Array[] = [Uint8Array.of(0xff, SOI)];
  let orientation = 1;
  let i = 2;
  let sawScan = false;
  let ended = false;

  while (i < b.length) {
    if (b[i] !== 0xff) return null; // lost our place: not a JPEG we understand
    let m = b[i + 1];
    while (m === 0xff && i + 2 < b.length) {
      i += 1; // fill bytes
      m = b[i + 1];
    }
    if (m === undefined) return null;

    if (m === EOI) {
      kept.push(Uint8Array.of(0xff, EOI));
      ended = true;
      break; // anything after the end of the image is dropped
    }
    // Markers with no length: RSTn, TEM.
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) {
      kept.push(Uint8Array.of(0xff, m));
      i += 2;
      continue;
    }
    if (i + 4 > b.length) return null;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return null;
    const dataStart = i + 4;
    const segEnd = i + 2 + len;

    let keep = true;
    if (m >= APP0 && m <= 0xef) {
      keep =
        (m === APP0 && startsWith(b, dataStart, JFIF)) ||
        (m === APP2 && startsWith(b, dataStart, ICC)) ||
        (m === APP14 && startsWith(b, dataStart, ADOBE));
      if (m === APP1 && startsWith(b, dataStart, EXIF_ID)) orientation = readOrientation(b, dataStart, segEnd);
    } else if (m === 0xfe) {
      keep = false; // comments
    }
    if (keep) kept.push(b.subarray(i, segEnd));

    if (m === SOS) {
      sawScan = true;
      // The compressed picture follows, up to the next real marker. Copy it
      // untouched. 0xFF00 is an escaped data byte and 0xFFD0-D7 are restart
      // markers, both part of the data.
      let j = segEnd;
      while (j < b.length) {
        if (b[j] === 0xff) {
          const n = b[j + 1];
          if (n === undefined) return null;
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7) || n === 0xff) {
            j += n === 0xff ? 1 : 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      kept.push(b.subarray(segEnd, j));
      i = j;
      continue;
    }
    i = segEnd;
  }
  if (!sawScan || !ended) return null;

  // Put back only the orientation, after the first (JFIF) segment if present.
  if (orientation !== 1) {
    const at = kept.length > 1 && kept[1][1] === APP0 ? 2 : 1;
    kept.splice(at, 0, orientationSegment(orientation));
  }
  const total = kept.reduce((n, s) => n + s.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const s of kept) {
    out.set(s, o);
    o += s.length;
  }
  return { bytes: out, orientation };
}

// True for the image types a phone or the web picker hands over.
export function looksLikeImage(mimeType: string, name: string): boolean {
  return /^image\//i.test(mimeType) || /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$/i.test(name);
}
