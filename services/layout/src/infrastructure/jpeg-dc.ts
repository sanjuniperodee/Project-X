import type { Raster } from './images';

/**
 * Decodes a JPEG at 1/8 scale from its DC coefficients only.
 *
 * Every 8×8 block of a JPEG stores its average colour as the DC coefficient, so the DC values
 * alone are an exact box-filtered 1/8-scale image: 500×375 px for a 12 MP phone photo — the size
 * a page preview needs. No inverse DCT and no full-size bitmap: a 12 MP photo decodes in a few MB
 * instead of the ~480 MB a full pure-JS decode takes. Baseline and progressive JPEGs are supported
 * (for progressive files only the first, DC scan is read).
 */
export class UnsupportedJpeg extends Error {}

interface Component {
  id: number;
  h: number;
  v: number;
  tq: number;
  blocksW: number;
  blocksH: number;
  dc: Float32Array | null;
}

interface Huffman {
  maxcode: Int32Array;
  valptr: Int32Array;
  mincode: Int32Array;
  values: Uint8Array;
}

function buildHuffman(counts: Uint8Array, values: Uint8Array): Huffman {
  const maxcode = new Int32Array(18).fill(-1);
  const valptr = new Int32Array(17);
  const mincode = new Int32Array(17);
  let code = 0;
  let k = 0;
  for (let length = 1; length <= 16; length++) {
    const n = counts[length - 1]!;
    if (n > 0) {
      valptr[length] = k;
      mincode[length] = code;
      code += n;
      k += n;
      maxcode[length] = code - 1;
    }
    code <<= 1;
  }
  return { maxcode, valptr, mincode, values };
}

class BitReader {
  private bits = 0;
  private count = 0;
  /** Set when a marker ends the entropy-coded segment. */
  marker: number | null = null;

  constructor(
    private readonly data: Uint8Array,
    public offset: number,
  ) {}

  private fill(): void {
    if (this.marker !== null) {
      this.bits = (this.bits << 8) | 0;
      this.count += 8;
      return;
    }
    let byte = this.data[this.offset++] ?? 0;
    if (byte === 0xff) {
      const next = this.data[this.offset] ?? 0;
      if (next === 0x00) this.offset++;
      else {
        this.marker = next;
        this.offset--;
        byte = 0;
      }
    }
    this.bits = ((this.bits << 8) | byte) >>> 0;
    this.count += 8;
  }

  bit(): number {
    if (this.count === 0) this.fill();
    this.count--;
    return (this.bits >>> this.count) & 1;
  }

  receive(length: number): number {
    let value = 0;
    for (let i = 0; i < length; i++) value = (value << 1) | this.bit();
    return value;
  }

  decode(table: Huffman): number {
    let code = this.bit();
    for (let length = 1; length <= 16; length++) {
      if (code <= table.maxcode[length]! && table.maxcode[length]! >= 0) {
        return table.values[table.valptr[length]! + code - table.mincode[length]!]!;
      }
      code = (code << 1) | this.bit();
    }
    throw new UnsupportedJpeg('Bad Huffman code');
  }

  /** Byte-aligns and consumes an RST marker. */
  restart(): void {
    this.bits = 0;
    this.count = 0;
    if (this.marker === null) {
      // Find the marker if the stream did not run into it yet.
      while (this.offset < this.data.length - 1 && !(this.data[this.offset] === 0xff && this.data[this.offset + 1]! >= 0xd0 && this.data[this.offset + 1]! <= 0xd7)) this.offset++;
    }
    if (this.data[this.offset] === 0xff && this.data[this.offset + 1]! >= 0xd0 && this.data[this.offset + 1]! <= 0xd7) this.offset += 2;
    this.marker = null;
  }
}

const extend = (value: number, length: number) => (length === 0 ? 0 : value < 1 << (length - 1) ? value - (1 << length) + 1 : value);

export function decodeJpegDc(data: Uint8Array): Raster {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const quant: Array<number | undefined> = [];
  const dcTables: Array<Huffman | undefined> = [];
  const acTables: Array<Huffman | undefined> = [];
  let components: Component[] = [];
  let width = 0;
  let height = 0;
  let hmax = 1;
  let vmax = 1;
  let progressive = false;
  let restartInterval = 0;
  let adobeTransform: number | null = null;

  let offset = 2;
  while (offset < data.length) {
    if (data[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = data[offset + 1]!;
    offset += 2;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      if (marker === 0xff) offset--;
      continue;
    }
    if (marker === 0xd9) break;
    const length = view.getUint16(offset);
    const segment = offset + 2;
    const end = offset + length;

    if (marker === 0xdb) {
      let p = segment;
      while (p < end) {
        const pq = data[p]! >> 4;
        const tq = data[p]! & 15;
        // DC quantiser is the first value in zigzag order.
        quant[tq] = pq ? view.getUint16(p + 1) : data[p + 1]!;
        p += 1 + 64 * (pq ? 2 : 1);
      }
    } else if (marker === 0xc4) {
      let p = segment;
      while (p < end) {
        const tc = data[p]! >> 4;
        const th = data[p]! & 15;
        const counts = data.subarray(p + 1, p + 17);
        const total = counts.reduce((a, b) => a + b, 0);
        const table = buildHuffman(counts, data.slice(p + 17, p + 17 + total));
        (tc === 0 ? dcTables : acTables)[th] = table;
        p += 17 + total;
      }
    } else if (marker === 0xdd) {
      restartInterval = view.getUint16(segment);
    } else if (marker === 0xee && length >= 12 && Buffer.from(data.subarray(segment, segment + 5)).toString('ascii') === 'Adobe') {
      adobeTransform = data[segment + 11]!;
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (marker !== 0xc0 && marker !== 0xc1 && marker !== 0xc2) throw new UnsupportedJpeg(`Unsupported JPEG frame type 0x${marker.toString(16)}`);
      progressive = marker === 0xc2;
      height = view.getUint16(segment + 1);
      width = view.getUint16(segment + 3);
      const count = data[segment + 5]!;
      components = [];
      for (let i = 0; i < count; i++) {
        const p = segment + 6 + i * 3;
        components.push({ id: data[p]!, h: data[p + 1]! >> 4, v: data[p + 1]! & 15, tq: data[p + 2]!, blocksW: 0, blocksH: 0, dc: null });
      }
      hmax = Math.max(...components.map((c) => c.h));
      vmax = Math.max(...components.map((c) => c.v));
      const mcusX = Math.ceil(width / (8 * hmax));
      const mcusY = Math.ceil(height / (8 * vmax));
      for (const c of components) {
        c.blocksW = mcusX * c.h;
        c.blocksH = mcusY * c.v;
      }
    } else if (marker === 0xda) {
      const count = data[segment]!;
      const scan = Array.from({ length: count }, (_, i) => {
        const id = data[segment + 1 + i * 2]!;
        const tables = data[segment + 2 + i * 2]!;
        const component = components.find((c) => c.id === id);
        if (!component) throw new UnsupportedJpeg('Scan references an unknown component');
        return { component, dc: dcTables[tables >> 4], ac: acTables[tables & 15] };
      });
      const p = segment + 1 + count * 2;
      const ss = data[p]!;
      const se = data[p + 1]!;
      const ah = data[p + 2]! >> 4;
      const al = data[p + 2]! & 15;
      const reader = new BitReader(data, end);
      const needed = ss === 0 && ah === 0 && scan.some((s) => !s.component.dc);
      if (needed) {
        decodeScan(reader, scan, { progressive, se, al, restartInterval, hmax, vmax, width, height });
        if (components.every((c) => c.dc)) break;
      }
      offset = skipEntropy(data, needed ? reader.offset : end);
      continue;
    }
    offset = end;
  }

  if (components.length === 0 || components.some((c) => !c.dc)) throw new UnsupportedJpeg('JPEG without a complete DC scan');
  if (components.length !== 1 && components.length !== 3) throw new UnsupportedJpeg('Only grayscale and YCbCr JPEGs are supported');

  const outW = Math.max(1, Math.ceil(width / 8));
  const outH = Math.max(1, Math.ceil(height / 8));
  const out = new Uint8Array(outW * outH * 4);
  const sample = (c: Component, x: number, y: number) => {
    const bx = Math.min(c.blocksW - 1, Math.floor((x * c.h) / hmax));
    const by = Math.min(c.blocksH - 1, Math.floor((y * c.v) / vmax));
    // DC × quantiser / 8 is the block mean minus the 128 level shift.
    return (c.dc![by * c.blocksW + bx]! * (quant[c.tq] ?? 1)) / 8 + 128;
  };
  const rgb = components.length === 3 && adobeTransform === 0;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const o = (y * outW + x) * 4;
      if (components.length === 1) {
        const g = sample(components[0]!, x, y);
        out[o] = out[o + 1] = out[o + 2] = g;
      } else if (rgb) {
        out[o] = sample(components[0]!, x, y);
        out[o + 1] = sample(components[1]!, x, y);
        out[o + 2] = sample(components[2]!, x, y);
      } else {
        const Y = sample(components[0]!, x, y);
        const cb = sample(components[1]!, x, y) - 128;
        const cr = sample(components[2]!, x, y) - 128;
        out[o] = Y + 1.402 * cr;
        out[o + 1] = Y - 0.344136 * cb - 0.714136 * cr;
        out[o + 2] = Y + 1.772 * cb;
      }
      out[o + 3] = 255;
    }
  }
  return { width: outW, height: outH, data: out };
}

function decodeScan(
  reader: BitReader,
  scan: Array<{ component: Component; dc: Huffman | undefined; ac: Huffman | undefined }>,
  frame: { progressive: boolean; se: number; al: number; restartInterval: number; hmax: number; vmax: number; width: number; height: number },
) {
  for (const s of scan) {
    if (!s.dc) throw new UnsupportedJpeg('Missing DC Huffman table');
    if (!frame.progressive && frame.se > 0 && !s.ac) throw new UnsupportedJpeg('Missing AC Huffman table');
    s.component.dc = new Float32Array(s.component.blocksW * s.component.blocksH);
  }
  const predictions = new Int32Array(scan.length);
  const decodeBlock = (index: number, target: Float32Array, at: number) => {
    const s = scan[index]!;
    const t = reader.decode(s.dc!);
    predictions[index] = predictions[index]! + extend(reader.receive(t), t);
    target[at] = predictions[index]! << frame.al;
    if (frame.progressive || frame.se === 0) return;
    // Baseline: walk the AC coefficients only to skip them.
    for (let k = 1; k < 64; ) {
      const rs = reader.decode(s.ac!);
      const r = rs >> 4;
      const size = rs & 15;
      if (size === 0) {
        if (r !== 15) break;
        k += 16;
        continue;
      }
      k += r;
      reader.receive(size);
      k++;
    }
  };

  let mcu = 0;
  const restart = () => {
    if (frame.restartInterval && mcu > 0 && mcu % frame.restartInterval === 0) {
      reader.restart();
      predictions.fill(0);
    }
  };

  if (scan.length === 1) {
    // Non-interleaved: blocks of the component in raster order, over its own (unpadded) size.
    const c = scan[0]!.component;
    const w = Math.ceil(Math.ceil((frame.width * c.h) / frame.hmax) / 8);
    const h = Math.ceil(Math.ceil((frame.height * c.v) / frame.vmax) / 8);
    for (let by = 0; by < h; by++) {
      for (let bx = 0; bx < w; bx++) {
        restart();
        decodeBlock(0, c.dc!, by * c.blocksW + bx);
        mcu++;
      }
    }
    return;
  }
  const mcusX = Math.ceil(frame.width / (8 * frame.hmax));
  const mcusY = Math.ceil(frame.height / (8 * frame.vmax));
  for (let my = 0; my < mcusY; my++) {
    for (let mx = 0; mx < mcusX; mx++) {
      restart();
      scan.forEach((s, index) => {
        const c = s.component;
        for (let v = 0; v < c.v; v++) {
          for (let h = 0; h < c.h; h++) decodeBlock(index, c.dc!, (my * c.v + v) * c.blocksW + mx * c.h + h);
        }
      });
      mcu++;
    }
  }
}

/** Returns the offset of the next marker after entropy-coded data. */
function skipEntropy(data: Uint8Array, from: number): number {
  let p = from;
  while (p < data.length - 1) {
    if (data[p] === 0xff) {
      const next = data[p + 1]!;
      if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) return p;
    }
    p++;
  }
  return data.length;
}
