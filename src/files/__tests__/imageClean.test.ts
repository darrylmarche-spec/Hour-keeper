import { readFileSync } from 'fs';
import { join } from 'path';
import { looksLikeImage, readOrientation, stripJpegMetadata } from '../imageClean';

const fx = (n: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', n)));
const text = (b: Uint8Array) => Buffer.from(b).toString('latin1');

// Marker names in order, e.g. ['SOI','APP0','DQT',...]. Walks segments the same way a decoder would.
function markers(b: Uint8Array): string[] {
  const names: Record<number, string> = { 0xd8: 'SOI', 0xd9: 'EOI', 0xda: 'SOS', 0xe0: 'APP0', 0xe1: 'APP1', 0xe2: 'APP2', 0xed: 'APP13', 0xee: 'APP14', 0xfe: 'COM', 0xdb: 'DQT', 0xc4: 'DHT', 0xc0: 'SOF0', 0xc2: 'SOF2', 0xdd: 'DRI' };
  const out: string[] = [];
  let i = 0;
  while (i < b.length) {
    if (b[i] !== 0xff) break;
    const m = b[i + 1];
    out.push(names[m] ?? `0x${m.toString(16)}`);
    if (m === 0xd8 || m === 0xd9) {
      i += 2;
      if (m === 0xd9) break;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    i += 2 + len;
    if (m === 0xda) {
      while (i < b.length && !(b[i] === 0xff && b[i + 1] !== 0x00 && !(b[i + 1] >= 0xd0 && b[i + 1] <= 0xd7))) i++;
    }
  }
  return out;
}

// The compressed picture itself: everything from the first scan header to the end.
const scanData = (b: Uint8Array) => {
  for (let i = 2; i < b.length - 1; i++) {
    if (b[i] === 0xff && b[i + 1] === 0xda) return Buffer.from(b.subarray(i)).toString('hex');
  }
  return '';
};

describe('removing hidden data from photos', () => {
  it('removes EXIF location, camera details, time and comments, and keeps colour and rotation', () => {
    const before = fx('gps-baseline.jpg');
    expect(markers(before)).toEqual(expect.arrayContaining(['APP1', 'APP2', 'COM']));
    expect(text(before)).toContain('TestPhone 9');
    expect(text(before)).toContain('secret location');

    const r = stripJpegMetadata(before)!;
    expect(r).not.toBeNull();
    const t = text(r.bytes);
    expect(t).not.toContain('TestPhone 9');
    expect(t).not.toContain('TestMake');
    expect(t).not.toContain('secret location');
    expect(t).not.toContain('2026:10:20'); // capture time
    expect(markers(r.bytes)).not.toContain('COM');
    expect(markers(r.bytes)).toContain('APP2'); // colour profile kept
    expect(text(r.bytes)).toContain('ICC_PROFILE');
    expect(r.orientation).toBe(6); // original photo said "rotated"; that's preserved
  });

  it('leaves only an orientation tag in the EXIF block, so no GPS tag can survive', () => {
    const r = stripJpegMetadata(fx('gps-baseline.jpg'))!;
    const exifSegments = markers(r.bytes).filter((m) => m === 'APP1');
    expect(exifSegments).toHaveLength(1);
    const i = Buffer.from(r.bytes).indexOf(Buffer.from('Exif\0\0', 'latin1'));
    const len = (r.bytes[i - 2] << 8) | r.bytes[i - 1];
    expect(len).toBe(2 + 6 + 8 + 2 + 12 + 4); // header + TIFF header + 1 entry + terminator
    expect(readOrientation(r.bytes, i, i + len - 2)).toBe(6);
    // no GPS IFD pointer (0x8825) or GPS tags anywhere in the file
    expect(Buffer.from(r.bytes).includes(Buffer.from([0x88, 0x25]))).toBe(false);
  });

  it('does not touch the picture data, so quality is unchanged', () => {
    for (const name of ['gps-baseline.jpg', 'gps-xmp-progressive.jpg', 'gps-trailing.jpg', 'clean.jpg']) {
      const before = fx(name);
      const after = stripJpegMetadata(before)!.bytes;
      // Scan data of the primary image is byte-for-byte the same up to its end.
      const a = scanData(after);
      expect(scanData(before).startsWith(a.slice(0, a.length - 4))).toBe(true);
      expect(markers(after)[markers(after).length - 1]).toBe('EOI');
    }
  });

  it('removes XMP packets (a second place GPS hides) and works on progressive photos', () => {
    const before = fx('gps-xmp-progressive.jpg');
    expect(text(before)).toContain('GPSLatitude');
    const r = stripJpegMetadata(before)!;
    expect(text(r.bytes)).not.toContain('GPSLatitude');
    expect(text(r.bytes)).not.toContain('xmpmeta');
    expect(markers(r.bytes)).toContain('SOF2'); // still progressive
    expect(markers(r.bytes).filter((m) => m === 'SOS').length).toBeGreaterThan(1); // all scans kept
  });

  it('drops anything stuck on after the end of the image (e.g. a second photo with its own GPS)', () => {
    const before = fx('gps-trailing.jpg');
    // Two complete JPEGs back to back.
    expect(Buffer.from(before).toString('hex').split('ffd8').length).toBeGreaterThan(2);
    const r = stripJpegMetadata(before)!;
    expect(r.bytes.length).toBeLessThan(before.length - 500);
    expect(text(r.bytes)).not.toContain('Exif');
    expect(markers(r.bytes).filter((m) => m === 'SOI')).toHaveLength(1);
    expect(markers(r.bytes).filter((m) => m === 'EOI')).toHaveLength(1);
  });

  it('passes an already-clean photo through unchanged in content', () => {
    const before = fx('clean.jpg');
    const r = stripJpegMetadata(before)!;
    expect(r.orientation).toBe(1);
    expect(markers(r.bytes)).toEqual(markers(before));
  });

  it('returns null for anything that is not a complete JPEG, so it is never uploaded as if it were clean', () => {
    expect(stripJpegMetadata(new Uint8Array([]))).toBeNull();
    expect(stripJpegMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG
    expect(stripJpegMetadata(fx('gps-baseline.jpg').subarray(0, 300))).toBeNull(); // cut off
    expect(stripJpegMetadata(Uint8Array.from(Buffer.from('not an image at all')))).toBeNull();
  });

  it('recognises images by type or file name', () => {
    expect(looksLikeImage('image/heic', 'x')).toBe(true);
    expect(looksLikeImage('application/octet-stream', 'IMG_0001.JPG')).toBe(true);
    expect(looksLikeImage('application/pdf', 'plan.pdf')).toBe(false);
  });
});
