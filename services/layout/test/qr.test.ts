import { describe, expect, it } from 'vitest';
import { qrMatrix, qrPath } from '../src/domain/qr';

describe('QR code', () => {
  it('encodes a link as a square matrix with the three finder patterns', () => {
    const matrix = qrMatrix('https://coverme.kz/issue/Xq3vK9pLmN2rT8wY4zBc');
    const size = matrix.length;
    const at = (r: number, c: number) => matrix[r]![c];
    expect(size).toBeGreaterThanOrEqual(21);
    expect(matrix.every((row) => row.length === size)).toBe(true);
    // Finder patterns: a dark 7×7 frame in three corners.
    for (const [r, c] of [[0, 0], [0, size - 7], [size - 7, 0]] as const) {
      for (let i = 0; i < 7; i++) {
        expect(at(r, c + i)).toBe(true);
        expect(at(r + 6, c + i)).toBe(true);
        expect(at(r + i, c)).toBe(true);
      }
      expect(at(r + 1, c + 1)).toBe(false);
      expect(at(r + 3, c + 3)).toBe(true);
    }
  });

  it('draws runs of dark modules as rectangles inside the box', () => {
    const d = qrPath([[true, true], [false, true]], 10, 20, 20);
    expect(d).toBe('M10 20h20v10.05h-20ZM20 30h10v10.05h-10Z');
  });
});
