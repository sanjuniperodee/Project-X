/**
 * The outline of the person in a portrait, traced from a MODNet alpha matte.
 * Everything is normalised to the photo (x by its width, y by its height), so the same
 * silhouette serves the full-size print photo, a thumbnail and the browser preview.
 */
export interface Silhouette {
  /** Closed outline as [x0, y0, x1, y1, …]. */
  outline: number[];
  /** Bounding box of the person. */
  box: { x: number; y: number; w: number; h: number };
  /** Top of the head, its horizontal centre, width and (estimated) height. */
  head: { top: number; cx: number; width: number; height: number };
  /** Share of the photo covered by the person, 0…1. */
  area: number;
}

/** A matte with less (or more) person than this is not a portrait: no cutout. */
const MIN_AREA = 0.03;
const MAX_AREA = 0.97;
/** Simplification tolerance, in matte pixels. */
const TOLERANCE = 0.7;

export function traceSilhouette(matte: Float32Array, width: number, height: number, threshold = 0.5): Silhouette | null {
  const region = personRegion(matte, width, height, threshold);
  if (!region) return null;
  const { mask, count } = region;
  const area = count / (width * height);
  if (area < MIN_AREA || area > MAX_AREA) return null;

  // Marching squares over the matte limited to the region: sub-pixel edges, one closed outline.
  const field = new Float32Array(width * height);
  for (let i = 0; i < field.length; i++) {
    field[i] = mask[i] ? Math.max(matte[i]!, threshold) : Math.min(matte[i]!, threshold - 1e-3);
  }
  const loop = longestContour(field, width, height, threshold);
  if (loop.length < 8) return null;
  const simplified = simplifyClosed(loop, TOLERANCE);

  const outline: number[] = [];
  for (let i = 0; i < simplified.length; i += 2) {
    outline.push(round4((simplified[i]! + 0.5) / width), round4((simplified[i + 1]! + 0.5) / height));
  }
  return { outline, ...measure(mask, width, height), area: round4(area) };
}

/** Largest 4-connected blob above the threshold, with its holes filled. */
function personRegion(matte: Float32Array, width: number, height: number, threshold: number): { mask: Uint8Array; count: number } | null {
  const size = width * height;
  const labels = new Int32Array(size);
  const stack = new Int32Array(size);
  let best = 0;
  let bestSize = 0;
  let label = 0;
  for (let start = 0; start < size; start++) {
    if (labels[start] !== 0 || matte[start]! < threshold) continue;
    label++;
    let top = 0;
    let count = 0;
    stack[top++] = start;
    labels[start] = label;
    while (top > 0) {
      const i = stack[--top]!;
      count++;
      const x = i % width;
      const neighbours = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
      for (const j of neighbours) {
        if (j < 0 || j >= size || labels[j] !== 0 || matte[j]! < threshold) continue;
        labels[j] = label;
        stack[top++] = j;
      }
    }
    if (count > bestSize) {
      bestSize = count;
      best = label;
    }
  }
  if (best === 0) return null;

  // Holes: background not reachable from the border of the photo.
  const outside = new Uint8Array(size);
  let top = 0;
  const push = (i: number) => {
    if (labels[i] !== best && !outside[i]) {
      outside[i] = 1;
      stack[top++] = i;
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (top > 0) {
    const i = stack[--top]!;
    const x = i % width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i < size - width) push(i + width);
  }
  const mask = new Uint8Array(size);
  let count = 0;
  for (let i = 0; i < size; i++) {
    if (!outside[i]) {
      mask[i] = 1;
      count++;
    }
  }
  return { mask, count };
}

/**
 * Bounding box and head of the person. The head ends at the neck (the narrowest row after the
 * widest part of the head); when hair hides the neck, its width is read just below the top.
 */
function measure(mask: Uint8Array, width: number, height: number): Pick<Silhouette, 'box' | 'head'> {
  const left = new Int32Array(height).fill(-1);
  const right = new Int32Array(height).fill(-1);
  let minX = width;
  let maxX = -1;
  let minY = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (left[y] === -1) left[y] = x;
      right[y] = x;
    }
    if (left[y] === -1) continue;
    if (minY === -1) minY = y;
    maxY = y;
    minX = Math.min(minX, left[y]!);
    maxX = Math.max(maxX, right[y]!);
  }
  const boxH = maxY - minY + 1;
  const rowWidth = (y: number) => (left[y] === -1 ? 0 : right[y]! - left[y]! + 1);

  // Look for the neck within the upper half of the person.
  let widest = 0;
  let neck = -1;
  const limit = Math.min(maxY, minY + Math.round(boxH * 0.5));
  for (let y = minY; y <= limit; y++) {
    const w = rowWidth(y);
    if (w > widest) widest = w;
    else if (y - minY > boxH * 0.04 && w < widest * 0.8) {
      // Confirm: something wider (shoulders) follows.
      for (let k = y; k <= limit; k++) {
        if (rowWidth(k) > widest * 1.15) {
          neck = y;
          break;
        }
      }
      if (neck !== -1) break;
    }
  }

  let headWidth: number;
  let headBottom: number;
  if (neck !== -1) {
    headWidth = widest;
    headBottom = neck;
  } else {
    headWidth = rowWidth(Math.min(maxY, minY + Math.round(boxH * 0.1))) || widest;
    headBottom = Math.min(maxY, minY + Math.round(headWidth * 1.3));
  }

  let centre = 0;
  let rows = 0;
  const band = Math.max(minY + 1, Math.min(headBottom, minY + Math.round(boxH * 0.1)));
  for (let y = minY; y <= band; y++) {
    if (left[y] === -1) continue;
    centre += (left[y]! + right[y]! + 1) / 2;
    rows++;
  }
  const cx = rows ? centre / rows : (minX + maxX + 1) / 2;

  return {
    box: { x: round4(minX / width), y: round4(minY / height), w: round4((maxX - minX + 1) / width), h: round4(boxH / height) },
    head: {
      top: round4(minY / height),
      cx: round4(cx / width),
      width: round4(headWidth / width),
      height: round4((headBottom - minY + 1) / height),
    },
  };
}

/**
 * Marching squares at `level`, chained into closed loops; returns the longest as [x, y, …]
 * in pixel-centre coordinates. The grid is padded by one outside cell so loops close at the edges.
 */
function longestContour(field: Float32Array, width: number, height: number, level: number): number[] {
  const W = width + 2;
  const H = height + 2;
  const value = (gx: number, gy: number) => {
    const x = gx - 1;
    const y = gy - 1;
    return x < 0 || y < 0 || x >= width || y >= height ? 0 : field[y * width + x]!;
  };
  // Edge ids: horizontal edges first, then vertical; each crossing point is shared by two segments.
  const hEdge = (gx: number, gy: number) => gy * W + gx;
  const vEdge = (gx: number, gy: number) => W * H + gy * W + gx;
  const points = new Map<number, [number, number]>();
  const crossing = (id: number, ax: number, ay: number, bx: number, by: number) => {
    if (!points.has(id)) {
      const a = value(ax, ay);
      const b = value(bx, by);
      const t = a === b ? 0.5 : Math.min(1, Math.max(0, (level - a) / (b - a)));
      points.set(id, [ax + (bx - ax) * t - 1, ay + (by - ay) * t - 1]);
    }
    return id;
  };
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (links.get(a) ?? links.set(a, []).get(a)!).push(b);
    (links.get(b) ?? links.set(b, []).get(b)!).push(a);
  };

  for (let gy = 0; gy < H - 1; gy++) {
    for (let gx = 0; gx < W - 1; gx++) {
      const tl = value(gx, gy) >= level ? 8 : 0;
      const tr = value(gx + 1, gy) >= level ? 4 : 0;
      const br = value(gx + 1, gy + 1) >= level ? 2 : 0;
      const bl = value(gx, gy + 1) >= level ? 1 : 0;
      const code = tl | tr | br | bl;
      if (code === 0 || code === 15) continue;
      const T = () => crossing(hEdge(gx, gy), gx, gy, gx + 1, gy);
      const B = () => crossing(hEdge(gx, gy + 1), gx, gy + 1, gx + 1, gy + 1);
      const L = () => crossing(vEdge(gx, gy), gx, gy, gx, gy + 1);
      const R = () => crossing(vEdge(gx + 1, gy), gx + 1, gy, gx + 1, gy + 1);
      const centreInside = (value(gx, gy) + value(gx + 1, gy) + value(gx + 1, gy + 1) + value(gx, gy + 1)) / 4 >= level;
      switch (code) {
        case 1: case 14: link(L(), B()); break;
        case 2: case 13: link(B(), R()); break;
        case 3: case 12: link(L(), R()); break;
        case 4: case 11: link(T(), R()); break;
        case 6: case 9: link(T(), B()); break;
        case 7: case 8: link(T(), L()); break;
        case 5:
          if (centreInside) { link(T(), L()); link(B(), R()); } else { link(L(), B()); link(T(), R()); }
          break;
        case 10:
          if (centreInside) { link(T(), R()); link(L(), B()); } else { link(T(), L()); link(B(), R()); }
          break;
      }
    }
  }

  const visited = new Set<number>();
  let longest: number[] = [];
  for (const start of links.keys()) {
    if (visited.has(start)) continue;
    const loop: number[] = [];
    let previous = -1;
    let current = start;
    while (!visited.has(current)) {
      visited.add(current);
      const [x, y] = points.get(current)!;
      loop.push(x, y);
      const next = links.get(current)!.find((n) => n !== previous && !visited.has(n));
      if (next === undefined) break;
      previous = current;
      current = next;
    }
    if (loop.length > longest.length) longest = loop;
  }
  return longest;
}

/** Ramer–Douglas–Peucker for a closed loop: split at the two farthest-apart points, simplify both halves. */
function simplifyClosed(loop: number[], tolerance: number): number[] {
  const n = loop.length / 2;
  let far = 0;
  let farDistance = -1;
  for (let i = 1; i < n; i++) {
    const d = (loop[2 * i]! - loop[0]!) ** 2 + (loop[2 * i + 1]! - loop[1]!) ** 2;
    if (d > farDistance) {
      farDistance = d;
      far = i;
    }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[far] = 1;
  const stack: Array<[number, number]> = [
    [0, far],
    [far, n],
  ];
  const at = (i: number) => (i % n) * 2;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = loop[at(a)]!;
    const ay = loop[at(a) + 1]!;
    const bx = loop[at(b)]!;
    const by = loop[at(b) + 1]!;
    const length = Math.hypot(bx - ax, by - ay) || 1;
    let worst = -1;
    let worstDistance = tolerance;
    for (let i = a + 1; i < b; i++) {
      const px = loop[at(i)]!;
      const py = loop[at(i) + 1]!;
      const distance = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
      if (distance > worstDistance) {
        worstDistance = distance;
        worst = i;
      }
    }
    if (worst !== -1) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(loop[2 * i]!, loop[2 * i + 1]!);
  return out;
}

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
