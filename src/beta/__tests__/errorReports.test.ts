import { ErrorReporter, errorText, isNoise, MAX_PER_SESSION } from '../errorReports';
import { inviteText } from '../invite';

let n = 0;
const newId = () => `id${++n}`;

describe('problem reports', () => {
  it('holds problems until the data is ready, then sends them', () => {
    const r = new ErrorReporter(newId);
    r.report(new TypeError('x is undefined'), '/job/1');
    const sent: unknown[] = [];
    r.connect((row) => sent.push(row));
    expect(sent).toEqual([expect.objectContaining({ message: 'TypeError: x is undefined', screen: '/job/1', count: 1 })]);
  });

  it('counts the same problem on one row', () => {
    const r = new ErrorReporter(newId);
    const sent: { id: string; count: number }[] = [];
    r.connect((row) => sent.push(row));
    r.report(new Error('boom'));
    r.report(new Error('boom'));
    expect(sent.map((s) => s.count)).toEqual([1, 2]);
    expect(sent[0].id).toBe(sent[1].id);
  });

  it('ignores no-signal noise and caps a session', () => {
    const r = new ErrorReporter(newId);
    const ids = new Set<string>();
    r.connect((row) => ids.add(row.id));
    r.report(new TypeError('Failed to fetch'));
    expect(ids.size).toBe(0);
    for (let i = 0; i < MAX_PER_SESSION + 5; i++) r.report(new Error(`e${i}`));
    expect(ids.size).toBe(MAX_PER_SESSION);
    expect(isNoise('Network request failed')).toBe(true);
  });

  it('never throws if saving fails', () => {
    const r = new ErrorReporter(newId);
    r.connect(() => {
      throw new Error('disk full');
    });
    expect(() => r.report(new Error('x'))).not.toThrow();
  });

  it('describes odd values plainly', () => {
    expect(errorText('plain').message).toBe('plain');
    expect(errorText({ code: 1 }).message).toBe('{"code":1}');
    expect(errorText(new RangeError('bad')).message).toBe('RangeError: bad');
  });
});

describe('invite message', () => {
  it('has the link, the sign-up step and home-screen steps for both phones', () => {
    const t = inviteText('https://hourkeeper.vercel.app');
    expect(t).toContain('open https://hourkeeper.vercel.app');
    expect(t).toContain('Request an account');
    expect(t).toMatch(/iPhone.*Add to Home Screen/);
    expect(t).toMatch(/Android.*Add to Home screen/);
  });
});
