import { formatBytes, safeFileName, storagePath } from '../naming';

describe('attachment file names', () => {
  it('puts the job first so access follows the job', () => {
    expect(storagePath('job1', 'att1', 'Site photo.jpg')).toBe('job1/att1/Site-photo.jpg');
  });

  it('strips characters that would break a storage path', () => {
    expect(safeFileName('../../etc/passwd')).toBe('....etcpasswd');
    expect(safeFileName('Pit / ladder #2 (east).JPG')).toBe('Pit-ladder-2-east.JPG');
    expect(safeFileName('Café plan.pdf')).toBe('Cafe-plan.pdf');
    expect(safeFileName('')).toBe('file');
    expect(safeFileName('..')).toBe('file');
  });

  it('shows sizes plainly', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5 MB');
  });
});
