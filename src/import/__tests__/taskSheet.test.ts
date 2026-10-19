import { readFileSync } from 'fs';
import { join } from 'path';
import { readTaskFile } from '../readTaskFile';
import { ParsedSheet, parseRows, parseTextLines, sumHours } from '../taskSheet';

const fixture = (name: string) => {
  const buf = readFileSync(join(__dirname, 'fixtures', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

// What every format of the Highett sheet should produce.
function expectHighett(sheet: ParsedSheet) {
  expect(sheet.title).toBe('Hightett Common Building F - Duplex');
  expect(sheet.quotedTotal).toBe(193);
  expect(sheet.lines).toHaveLength(59);
  expect(sumHours(sheet.lines)).toBe(216);
  expect(sheet.lines[0]).toMatchObject({ lineNo: '0', name: 'Dismantling', hours: 0, issues: [] });
  expect(sheet.lines[1]).toMatchObject({ lineNo: '1', name: 'Induction, ACW, shaft site walk, delivery', hours: 8 });
  const wiring = sheet.lines.find((l) => l.name.startsWith('Hoistway wiring'));
  expect(wiring).toMatchObject({ lineNo: '45', name: 'Hoistway wiring (1hr per floor)', hours: 9 });
  expect(sheet.lines[sheet.lines.length - 1]).toMatchObject({ lineNo: '62', name: 'Builders Lift Re-tune + Test' });
  // The sheet's typos (13 and 15 printed as "16") get flagged for the PM
  const flagged = sheet.lines.filter((l) => l.issues.length).map((l) => l.name);
  expect(flagged).toEqual(
    expect.arrayContaining([
      '5th Rail (5m) Brackets and guide rails',
      '7th Rail (5m) Brackets and guide rails',
      '8th Rail (5m) Brackets and guide rails',
    ]),
  );
  expect(sheet.warnings).toEqual([]);
}

describe('Highett sheet', () => {
  it('reads the CSV', async () => {
    expectHighett(await readTaskFile({ name: 'highett.csv', bytes: fixture('highett.csv') }));
  });

  it('reads the Excel file', async () => {
    expectHighett(await readTaskFile({ name: 'highett.xlsx', bytes: fixture('highett.xlsx') }));
  });
});

describe('parseRows', () => {
  it('handles a separate line-number column', () => {
    const s = parseRows([
      ['No.', 'Task', 'Sold hrs'],
      [1, 'Induction', 8],
      [2, 'Plumbing', '3.5'],
    ]);
    expect(s.lines).toEqual([
      { lineNo: '1', name: 'Induction', hours: 8, issues: [] },
      { lineNo: '2', name: 'Plumbing', hours: 3.5, issues: [] },
    ]);
  });

  it('flags lines with no or unreadable hours', () => {
    const s = parseRows([
      ['', 'Allowance'],
      ['1. Induction', ''],
      ['2. Plumbing', 'TBC'],
    ]);
    expect(s.lines[0]).toMatchObject({ hours: null, issues: ['No hours found'] });
    expect(s.lines[1]).toMatchObject({ hours: null, issues: ['Couldn’t read hours "TBC"'.replace('’', "'")] });
  });

  it('ignores the Actual column', () => {
    const s = parseRows([
      ['Allowance', 'Actual'].map((h) => h),
      ['1. Induction', 8, 11],
    ]);
    expect(s.lines[0].hours).toBe(8);
  });

  it('warns when nothing looks like a task line', () => {
    const s = parseRows([['Hello'], ['World']]);
    expect(s.lines).toHaveLength(0);
    expect(s.warnings).toHaveLength(1);
  });
});

describe('parseTextLines (PDF text)', () => {
  it('reads lines with column gaps', () => {
    const s = parseTextLines([
      'Hightett Common Building F - Duplex     Total Allowed Hours 193 =',
      'Allowance   Actual',
      '0. Dismantling      0',
      '45. Hoistway wiring (1hr per floor )      9',
      '49. Buttons and Indicators wiring (How long per floor?)    8',
    ]);
    expect(s.title).toBe('Hightett Common Building F - Duplex');
    expect(s.quotedTotal).toBe(193);
    expect(s.lines.map((l) => [l.lineNo, l.hours])).toEqual([
      ['0', 0],
      ['45', 9],
      ['49', 8],
    ]);
  });

  it('reads a trailing number separated by a single space', () => {
    const s = parseTextLines(['12. 4th Rail (5m) Brackets and guide rails 4']);
    expect(s.lines[0]).toMatchObject({ lineNo: '12', name: '4th Rail (5m) Brackets and guide rails', hours: 4 });
  });
});
