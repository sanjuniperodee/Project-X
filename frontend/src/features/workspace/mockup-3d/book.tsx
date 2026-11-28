'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { LayoutPage } from '@px/contracts';
import { anchor, clamp, Cuboid, cssUrl, L, PageImage, preserve, sheen, StageFrame, ToolButton, useStage, ViewTools, type FaceSpec } from './stage';

/**
 * A magazine or a book: leaves hinged at the spine, turned one by one. Only the outermost face on each side of the
 * two stacks is drawn (plus the leaf in flight), so planes never lie on top of each other and nothing flickers;
 * the stacks themselves are boxes of paper edges that grow and shrink as the pages turn.
 */

export type Binding = 'saddle' | 'hardcover';

interface BindingSpec {
  /** Thickness of a paper leaf and of a cover leaf, mm (slightly exaggerated, so the block reads on screen). */
  paper: number;
  cover: number;
  /** Hardcover: how far the boards stand out of the block, mm. */
  overhang: number;
  /** Colour of the cloth on board edges and spine; null — taken from the cover page. */
  cloth: string | null;
  endpaper: string;
}

const BINDINGS: Record<Binding, BindingSpec> = {
  // Cover Me: saddle-stitched, the cover is a heavier sheet of the same size; the spine is just the fold.
  saddle: { paper: 0.14, cover: 0.35, overhang: 0, cloth: null, endpaper: '#ffffff' },
  // Шежіре: boards wrapped in indigo cloth, warm endpapers.
  hardcover: { paper: 0.16, cover: 2.6, overhang: 3, cloth: '#18213f', endpaper: '#e7dcc8' },
};

type Content = { kind: 'page'; page: LayoutPage } | { kind: 'endpaper' } | { kind: 'blank' };
interface Leaf {
  front: Content;
  back: Content;
  /** A hardcover board: larger than the block, with edges of its own. */
  board: boolean;
  t: number;
}

const page = (p: LayoutPage): Content => ({ kind: 'page', page: p });
const BLANK: Content = { kind: 'blank' };
const ENDPAPER: Content = { kind: 'endpaper' };

/**
 * Leaves in order. The first page is the front cover, the last one the back cover (as in the print PDF). A magazine
 * is folded sheets: pages simply pair up. A hardcover adds endpapers: the inside of each board and a flyleaf.
 */
export function buildLeaves(pages: LayoutPage[], binding: Binding): Leaf[] {
  const spec = BINDINGS[binding];
  const pair = (seq: Content[], t: number): Leaf[] => {
    const out: Leaf[] = [];
    for (let i = 0; i < seq.length; i += 2) out.push({ front: seq[i]!, back: seq[i + 1] ?? BLANK, board: false, t });
    return out;
  };
  if (binding === 'hardcover' && pages.length >= 2) {
    const inner: Content[] = [ENDPAPER, ...pages.slice(1, -1).map(page), ENDPAPER];
    if (inner.length % 2) inner.splice(inner.length - 1, 0, BLANK);
    return [
      { front: page(pages[0]!), back: ENDPAPER, board: true, t: spec.cover },
      ...pair(inner, spec.paper),
      { front: ENDPAPER, back: page(pages.at(-1)!), board: true, t: spec.cover },
    ];
  }
  const seq = pages.map(page);
  // The back cover must land on the back of the last leaf.
  if (seq.length > 1 && seq.length % 2) seq.splice(seq.length - 1, 0, BLANK);
  const leaves = pair(seq, BINDINGS.saddle.paper);
  leaves[0]!.t = spec.cover;
  if (leaves.length > 1) leaves.at(-1)!.t = spec.cover;
  return leaves;
}

/** Paper edge: smooth base with barely visible sheet lines (dense lines would moiré). */
const paperEdge = (deg: number): CSSProperties => ({
  background: `repeating-linear-gradient(${deg}deg, rgb(110 90 60 / 0) 0 2px, rgb(110 90 60 / 0.1) 2px 3px), linear-gradient(${deg + 90}deg, #ece6dc, #f8f5ef 40%, #ece6dc)`,
});
const gutter = (to: 'right' | 'left') => (
  <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(to ${to}, rgb(0 0 0 / 0.2), rgb(0 0 0 / 0.05) 7%, transparent 18%)` }} />
);

/** Images are loaded only for leaves this close to the spread being read (or flown to). */
const NEAR = 2;
const NEAR_DELAY_MS = 120;

export function BookMockup({ pages, binding: wanted }: { pages: LayoutPage[]; binding: Binding }) {
  const binding: Binding = wanted === 'hardcover' && pages.length >= 2 ? 'hardcover' : 'saddle';
  const spec = BINDINGS[binding];
  const hard = binding === 'hardcover';
  const leaves = useMemo(() => buildLeaves(pages, binding), [pages, binding]);
  const n = leaves.length;
  const cover = pages[0]!;
  const pw = cover.widthMm;
  const ph = cover.heightMm;
  const W = pw + spec.overhang;
  const H = ph + spec.overhang * 2;
  const prefix = useMemo(() => leaves.reduce<number[]>((acc, l) => [...acc, acc.at(-1)! + l.t], [0]), [leaves]);
  const D = prefix[n]!;
  const pivot = -W / 2;
  const extent = Math.hypot(W, H, D);
  const k = extent / Math.hypot(2 * W, H, D);

  const shift = useRef<HTMLDivElement>(null);
  const pileR = useRef<HTMLDivElement>(null);
  const pileL = useRef<HTMLDivElement>(null);
  const leafEls = useRef<(HTMLDivElement | null)[]>([]);
  const fronts = useRef<(HTMLDivElement | null)[]>([]);
  const backs = useRef<(HTMLDivElement | null)[]>([]);
  const lastAngle = useRef<number[]>([]);

  const layout = useCallback(
    (p: number) => {
      const open = clamp(p, 0, 1);
      const close = clamp(p - (n - 1), 0, 1);
      // The opening book moves right with its spine, so the centre of rotation stays in the middle of the spread.
      if (shift.current) shift.current.style.transform = `translateX(${L((W / 2) * (open + close))})`;
      const f = Math.floor(p + 1e-6);
      const turning = p - f > 0.001 && f < n ? f : -1;
      const s = turning >= 0 ? f : Math.round(p);
      // Turned leaves 0…tEnd lie on the left, rStart…n−1 on the right; the one in flight is in neither.
      const tEnd = turning >= 0 ? f - 1 : s - 1;
      const rStart = turning >= 0 ? f + 1 : s;
      for (let i = 0; i < n; i++) {
        const front = i === turning || i === rStart || (tEnd >= 0 && i === 0);
        const back = i === turning || i === tEnd || (rStart <= n - 1 && i === n - 1);
        const node = leafEls.current[i];
        if (!node) continue;
        const shown = front || back || leaves[i]!.board;
        node.style.display = shown ? '' : 'none';
        const fe = fronts.current[i];
        const be = backs.current[i];
        if (fe) fe.style.display = front ? '' : 'none';
        if (be) be.style.display = back ? '' : 'none';
        const a = clamp(p - i, 0, 1) * 180;
        if (shown && lastAngle.current[i] !== a) {
          lastAngle.current[i] = a;
          node.style.transform = `rotateY(${-a}deg)`;
        }
      }
      // Paper stacks: the right one shrinks, the left one grows.
      const [a0, a1] = hard ? [1, n - 2] : [0, n - 1];
      const place = (el: HTMLDivElement | null, lo: number, hi: number, fromTop: boolean) => {
        if (!el) return;
        if (hi < lo) {
          el.style.display = 'none';
          return;
        }
        const depth = prefix[hi + 1]! - prefix[lo]!;
        const bottom = -D / 2 + (fromTop ? D - prefix[hi + 1]! : prefix[lo]!);
        el.style.display = '';
        el.style.transform = `translateZ(${L(bottom + depth / 2)}) scale3d(1, 1, ${Math.max(0.0001, depth)})`;
      };
      place(pileR.current, Math.max(rStart, a0), a1, true);
      place(pileL.current, a0, Math.min(tEnd, a1), false);
      return (group: string) => clamp(p - Number(group.slice(1)), 0, 1) * 180;
    },
    [n, W, D, hard, leaves, prefix],
  );

  const stage = useStage({
    maxPos: n,
    closedAtEnd: true,
    initial: { rx: -14, ry: 28 },
    openView: { rx: 18, ry: 0, zoom: 1.25 },
    fit: (p) => 1 + (k - 1) * (clamp(p, 0, 1) - clamp(p - (n - 1), 0, 1)),
    layout,
    onTap: (tap) => stage.goTo(stage.target.current + (tap === 'next' ? 1 : -1)),
    duration: (from, to) => Math.min(1500, 700 + 110 * Math.max(0, Math.abs(to - from) - 1)),
  });
  const { slot, dest, rescan } = stage;

  useLayoutEffect(() => {
    lastAngle.current = [];
    rescan();
  }, [rescan, leaves]);

  // Leaves whose images are loaded: around the spread being read and the one flown to, covers always.
  const [near, setNear] = useState<ReadonlySet<number>>(() => new Set([0, 1, n - 1]));
  useEffect(() => {
    const id = window.setTimeout(() => {
      const set = new Set([0, n - 1]);
      for (const c of [slot, dest]) for (let i = c - NEAR; i <= c + NEAR; i++) if (i >= 0 && i < n) set.add(i);
      setNear(set);
    }, NEAR_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [slot, dest, n]);

  const face = (c: Content, i: number, side: 'front' | 'back'): FaceSpec => {
    const outer = (i === 0 && side === 'front') || (i === n - 1 && side === 'back');
    const board = leaves[i]!.board;
    return {
      tap: side === 'front' ? 'next' : 'prev',
      faceRef: (el) => {
        (side === 'front' ? fronts : backs).current[i] = el;
      },
      style: { background: c.kind === 'endpaper' ? spec.endpaper : '#ffffff' },
      node: (
        <>
          {c.kind === 'page' && <PageImage src={near.has(i) ? c.page.previewUrl : null} />}
          {!outer && gutter(side === 'front' ? 'right' : 'left')}
          {outer && board && side === 'front' && <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(90deg, rgb(0 0 0 / 0.22) 0, transparent 1.2%, rgb(0 0 0 / 0.2) 4.5%, rgb(255 255 255 / 0.1) 5.3%, transparent 9%)' }} />}
          {outer && sheen}
        </>
      ),
    };
  };
  const cloth: CSSProperties = { background: spec.cloth ?? '#ffffff' };
  // A magazine's spine is the fold of the cover: the leftmost millimetre of the front cover, stretched over it.
  const spine: CSSProperties = spec.cloth
    ? { background: `linear-gradient(90deg, rgb(0 0 0 / 0.3), rgb(255 255 255 / 0.1) 28%, transparent 55%, rgb(0 0 0 / 0.24)), linear-gradient(transparent 9%, #c7a257 9% 10%, transparent 10% 90%, #c7a257 90% 91%, transparent 91%), ${spec.cloth}` }
    : { backgroundImage: `linear-gradient(90deg, rgb(0 0 0 / 0.25), rgb(255 255 255 / 0.12) 50%, rgb(0 0 0 / 0.2)), ${cssUrl(cover.previewUrl)}`, backgroundSize: `100% 100%, ${L(pw * D)} 100%`, backgroundPosition: '0 0, left center' };

  const label = slot === 0 ? 'Обложка' : slot >= n ? 'Задняя обложка' : spreadLabel(leaves[slot - 1]!.back, leaves[slot]!.front);
  const kind = hard ? 'твёрдый переплёт' : 'скрепка';

  return (
    <div className="flex flex-col items-center gap-4">
      <StageFrame stage={stage.stage} orbit={stage.orbit} handlers={stage.handlers} extent={extent} label={`3D-модель: ${label}`} ground={{ top: H * 0.56, w: W * 1.1, h: D * 2 + 8 }}>
        <div ref={shift} className={anchor} style={preserve}>
          {/* Right stack of paper: only its edges; the top is the face of the first unturned leaf. */}
          <div ref={pileR} className={anchor} style={preserve}>
            <Cuboid w={pw} h={ph} d={1} at={[pivot + pw / 2, 0, 0]} faces={{ right: { style: paperEdge(90) }, top: { style: paperEdge(180) }, bottom: { style: paperEdge(180) } }} />
          </div>
          <div ref={pileL} className={anchor} style={{ ...preserve, display: 'none' }}>
            <Cuboid w={pw} h={ph} d={1} at={[pivot - pw / 2, 0, 0]} faces={{ left: { style: paperEdge(90) }, top: { style: paperEdge(180) }, bottom: { style: paperEdge(180) } }} />
          </div>
          {/* Spine */}
          <Cuboid w={0.01} h={hard ? H : ph} d={D} at={[pivot - 0.05, 0, 0]} faces={{ left: { style: spine } }} />

          {leaves.map((leaf, i) => {
            // Each leaf turns about the spine on an axis halfway between its place in the right and the left stack.
            const right = -D / 2 + (D - prefix[i + 1]!) + leaf.t / 2;
            const left = -D / 2 + prefix[i]! + leaf.t / 2;
            const lw = leaf.board ? W : pw;
            const lh = leaf.board ? H : ph;
            return (
              <div key={i} className={anchor} style={{ ...preserve, transform: `translate3d(${L(pivot)}, 0, ${L((right + left) / 2)})` }}>
                <div
                  ref={(el) => {
                    leafEls.current[i] = el;
                  }}
                  className={anchor}
                  style={preserve}
                >
                  <Cuboid
                    w={lw}
                    h={lh}
                    d={leaf.t}
                    at={[lw / 2, 0, (right - left) / 2]}
                    group={`l${i}`}
                    faces={{
                      front: face(leaf.front, i, 'front'),
                      back: face(leaf.back, i, 'back'),
                      ...(leaf.board ? { right: { style: cloth }, top: { style: cloth }, bottom: { style: cloth } } : {}),
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </StageFrame>

      <div className="flex w-full max-w-xl items-center gap-3">
        <ToolButton label="Предыдущий разворот" disabled={dest <= 0} onClick={() => stage.goTo(stage.target.current - 1)}>
          ←
        </ToolButton>
        <input
          type="range"
          aria-label="Разворот"
          aria-valuetext={label}
          min={0}
          max={n}
          step={1}
          value={dest}
          onChange={(e) => stage.goTo(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[var(--color-accent)]"
        />
        <ToolButton label="Следующий разворот" disabled={dest >= n} onClick={() => stage.goTo(stage.target.current + 1)}>
          →
        </ToolButton>
      </div>
      <p className="text-[15px] font-medium text-ink tabular-nums" aria-live="polite">
        {label}
      </p>

      <div role="toolbar" aria-label="Вид модели" className="flex flex-wrap items-center justify-center gap-2">
        <ToolButton onClick={() => stage.view({ rx: 0, ry: 0 })}>Лицо</ToolButton>
        {/* Closed on the back cover, the spine is on the other side. */}
        <ToolButton onClick={() => stage.view({ rx: 0, ry: stage.target.current === n ? -90 : 90 })}>Корешок</ToolButton>
        <ToolButton onClick={() => stage.view({ rx: 0, ry: 180 })}>Оборот</ToolButton>
        <ToolButton
          onClick={() => {
            if (stage.target.current === 0) stage.goTo(1);
            else if (stage.target.current === n) stage.goTo(n - 1);
            else stage.view({ rx: 18, ry: 0, zoom: 1.25 });
          }}
        >
          Читать
        </ToolButton>
        <ViewTools zoomBy={stage.zoomBy} auto={stage.auto} toggleAuto={stage.toggleAuto} reset={stage.reset} />
      </div>
      <p className="max-w-xl text-center text-[13px] leading-relaxed text-muted">
        {Math.round(pw)} × {Math.round(ph)} мм · {pages.length} стр. · {kind}. Поворачивайте мышью или пальцем, нажмите на страницу — она
        перелистнётся.<span className="max-sm:hidden"> С клавиатуры: ← → листают, Shift + ← → поворачивают.</span> Цвета на экране и на
        бумаге немного различаются.
      </p>
    </div>
  );
}

function spreadLabel(left: Content, right: Content) {
  const nums = [left, right].flatMap((c) => (c.kind === 'page' ? [c.page.number] : []));
  if (!nums.length) return 'Форзац';
  return nums.length === 2 ? `Страницы ${nums[0]}–${nums[1]}` : `Страница ${nums[0]}`;
}
