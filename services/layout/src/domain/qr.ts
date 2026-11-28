import qrcode from 'qrcode-generator';

/**
 * Dark modules of a QR code for `text` (medium error correction: survives a fingerprint or a
 * fold on a printed cover). Rows of booleans, top to bottom; no quiet zone included.
 */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)));
}

/** The modules as one SVG path in a square box: each row's runs of dark modules become rectangles. */
export function qrPath(matrix: boolean[][], x: number, y: number, size: number): string {
  const unit = size / matrix.length;
  const parts: string[] = [];
  const n = (value: number) => (Math.round(value * 100) / 100).toString();
  matrix.forEach((row, r) => {
    let start = -1;
    for (let c = 0; c <= row.length; c++) {
      const dark = c < row.length && row[c];
      if (dark && start === -1) start = c;
      if (!dark && start !== -1) {
        const left = x + start * unit;
        const top = y + r * unit;
        const width = (c - start) * unit;
        // A hair of overlap so neighbouring rows print without white seams.
        parts.push(`M${n(left)} ${n(top)}h${n(width)}v${n(unit + 0.05)}h${n(-width)}Z`);
        start = -1;
      }
    }
  });
  return parts.join('');
}
