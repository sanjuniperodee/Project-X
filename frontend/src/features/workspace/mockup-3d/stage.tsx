'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * A CSS 3D stage for printed products: a model made of flat planes (`preserve-3d`), rotated with the mouse or a finger,
 * lit by a fixed light (each face gets a black overlay by where its normal points), and one animated scalar `pos`
 * (a book's turned leaves, a box's lid). The same approach as the 3D book in MyBooks: no WebGL, so it works everywhere
 * and costs no dependency. Units are millimetres; `--u` is pixels per millimetre for the current frame size and zoom.
 */

/** Length in millimetres → CSS length. */
export const L = (mm: number) => `calc(${Math.round(mm * 1000) / 1000} * var(--u))`;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** CSS url() for a page preview (quoted, so any characters in the address are safe). */
export const cssUrl = (src: string) => `url(${JSON.stringify(src)})`;

export interface Orientation {
  rx: number;
  ry: number;
}
export interface View extends Orientation {
  zoom: number;
}

export const ZOOM = { min: 0.6, max: 2.4, step: 1.25 } as const;
const TILT_LIMIT = 90;

type Vec = readonly [number, number, number];

// ---------- Light ----------

const rad = (deg: number) => (deg * Math.PI) / 180;
function rotY([x, y, z]: Vec, deg: number): Vec {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [x * c + z * s, y, -x * s + z * c];
}
function rotX([x, y, z]: Vec, deg: number): Vec {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [x, y * c - z * s, y * s + z * c];
}
/** Light from the top left, almost from behind the viewer: faces turned to the viewer stay bright. */
const LIGHT: Vec = (() => {
  const v = [-0.3, -0.4, 0.86] as const;
  const len = Math.hypot(...v);
  return [v[0] / len, v[1] / len, v[2] / len];
})();
/** Opacity of the black overlay on a face with normal n (model space), turned by `turn` degrees around its hinge. */
function shade(n: Vec, view: Orientation, turn: number) {
  const w = rotX(rotY(turn ? rotY(n, -turn) : n, view.ry), view.rx);
  const light = 0.55 + 0.45 * Math.max(0, w[0] * LIGHT[0] + w[1] * LIGHT[1] + w[2] * LIGHT[2]);
  return (1 - light) * 0.6;
}

// ---------- Geometry ----------

export type Side = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

/** Rotation of a face, its size and its push along its own normal: six planes around a common centre make a box. */
const SIDES: Record<Side, { rotate: string; size: (w: number, h: number, d: number) => [number, number]; push: (w: number, h: number, d: number) => number; n: Vec }> = {
  front: { rotate: '', size: (w, h) => [w, h], push: (_w, _h, d) => d / 2, n: [0, 0, 1] },
  back: { rotate: 'rotateY(180deg)', size: (w, h) => [w, h], push: (_w, _h, d) => d / 2, n: [0, 0, -1] },
  right: { rotate: 'rotateY(90deg)', size: (_w, h, d) => [d, h], push: (w) => w / 2, n: [1, 0, 0] },
  left: { rotate: 'rotateY(-90deg)', size: (_w, h, d) => [d, h], push: (w) => w / 2, n: [-1, 0, 0] },
  top: { rotate: 'rotateX(90deg)', size: (w, _h, d) => [w, d], push: (_w, h) => h / 2, n: [0, -1, 0] },
  bottom: { rotate: 'rotateX(-90deg)', size: (w, _h, d) => [w, d], push: (_w, h) => h / 2, n: [0, 1, 0] },
};
const OPPOSITE: Record<Side, Side> = { front: 'back', back: 'front', left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

export const preserve: CSSProperties = { transformStyle: 'preserve-3d' };
/** A zero-size anchor of a group of planes. */
export const anchor = 'absolute top-0 left-0 size-0';
const hidden: CSSProperties = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };
/** A transparent outline makes browsers antialias the edges of rotated planes. */
const smooth: CSSProperties = { outline: '1px solid transparent' };

export interface FaceSpec {
  node?: ReactNode;
  style?: CSSProperties;
  /** What a tap on this face does (read by the stage's `onTap`). */
  tap?: string;
  /** For faces whose visibility the model switches every frame. */
  faceRef?: (el: HTMLDivElement | null) => void;
}

/**
 * A box w×h×d (mm) centred at `at`; only described faces are drawn. `inward` turns the faces to look inside
 * (walls and floor of an open box). `group` names the rotating part the box belongs to, for lighting.
 */
export function Cuboid({
  w,
  h,
  d,
  at = [0, 0, 0],
  faces,
  inward = false,
  group,
}: {
  w: number;
  h: number;
  d: number;
  at?: readonly [number, number, number];
  faces: Partial<Record<Side, FaceSpec>>;
  inward?: boolean;
  group?: string;
}) {
  return (
    <div className={anchor} style={{ ...preserve, transform: `translate3d(${L(at[0])}, ${L(at[1])}, ${L(at[2])})` }}>
      {(Object.keys(faces) as Side[]).map((side) => {
        const f = faces[side]!;
        const [fw, fh] = SIDES[side].size(w, h, d);
        const turn = inward ? SIDES[OPPOSITE[side]] : SIDES[side];
        const push = SIDES[side].push(w, h, d) * (inward ? -1 : 1);
        return (
          <div
            key={side}
            ref={f.faceRef}
            data-tap={f.tap}
            className="absolute top-0 left-0 overflow-hidden"
            style={{
              width: L(fw),
              height: L(fh),
              transform: `translate(-50%, -50%) ${turn.rotate} translateZ(${L(push)})`,
              ...hidden,
              ...smooth,
              ...f.style,
            }}
          >
            {f.node}
            <Shade n={turn.n} group={group} />
          </div>
        );
      })}
    </div>
  );
}

/** Black overlay whose opacity follows the light; `group` — the hinged part the face turns with. */
export function Shade({ n, group, k }: { n: Vec; group?: string; k?: number }) {
  return (
    <div
      aria-hidden
      data-n={n.join(',')}
      data-group={group}
      data-k={k}
      className="pointer-events-none absolute inset-0 bg-black"
      style={{ opacity: 0 }}
    />
  );
}

/** A page preview filling a face; without an address — clean paper. */
export function PageImage({ src }: { src: string | null }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- generated SVG preview
  return <img src={src} alt="" draggable={false} decoding="async" className="absolute inset-0 block size-full select-none" />;
}

/** Light glint sliding over glossy faces as the model turns. */
export const sheen = (
  <div
    aria-hidden
    className="pointer-events-none absolute inset-0"
    style={{ background: 'linear-gradient(115deg, transparent calc(var(--sheen, 50%) - 14%), rgb(255 255 255 / 0.16) var(--sheen, 50%), transparent calc(var(--sheen, 50%) + 14%))' }}
  />
);

// ---------- Motion ----------

export interface StageOptions {
  /** Largest value of pos (a book: number of leaves; a box: 1). */
  maxPos: number;
  /** The model is closed at maxPos too (a book on its back cover). */
  closedAtEnd?: boolean;
  initial: Orientation;
  /** View to turn to when the model opens (pos leaves 0). */
  openView: View;
  /** Model scale for pos, so that the open model fits the frame like the closed one. */
  fit: (pos: number) => number;
  /** Places the moving parts for pos; returns the hinge angle of a group, for lighting. */
  layout: (pos: number) => (group: string) => number;
  /** A tap on a face with data-tap (not a drag). */
  onTap: (tap: string) => void;
  /** Duration of a move from pos a to b, ms. */
  duration: (from: number, to: number) => number;
}

interface ShadeEl {
  el: HTMLElement;
  n: Vec;
  group: string | undefined;
  k: number;
  last: number;
}

/**
 * State of the stage lives outside React: every frame writes styles directly. React state only follows the rounded
 * position (labels, buttons) and the target (which images to load).
 */
export function useStage(options: StageOptions) {
  const opts = useRef(options);
  useLayoutEffect(() => {
    opts.current = options;
  });
  const stage = useRef<HTMLDivElement>(null);
  const orbit = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ ...options.initial, zoom: 1 });
  const pos = useRef(0);
  const target = useRef(0);
  const shades = useRef<ShadeEl[]>([]);
  const motion = useRef({
    vx: 0,
    vy: 0,
    dragging: false,
    auto: true,
    visible: true,
    anim: null as null | { from: View; to: View; t0: number; dur: number },
    move: null as null | { from: number; to: number; t0: number; dur: number },
    last: 0,
    raf: 0,
  });
  const pointers = useRef({
    map: new Map<number, { x: number; y: number }>(),
    pinch: null as null | { dist: number; zoom: number },
    last: null as null | { t: number; x: number; y: number },
    start: null as null | { x: number; y: number; tap: string | null; moved: boolean },
  });
  const [slot, setSlot] = useState(0);
  const slotRef = useRef(0);
  const [dest, setDest] = useState(0);
  const [auto, setAuto] = useState(true);

  const apply = useCallback(() => {
    const v = view.current;
    const p = pos.current;
    const o = opts.current;
    const angle = o.layout(p);
    const s = o.fit(p);
    if (orbit.current) orbit.current.style.transform = `scale3d(${s}, ${s}, ${s}) rotateX(${v.rx}deg) rotateY(${v.ry}deg)`;
    const el = stage.current;
    if (el) {
      el.style.setProperty('--zoom', String(v.zoom));
      el.style.setProperty('--ground', String(clamp(1 - Math.abs(v.rx) / 70, 0, 1)));
      el.style.setProperty('--sheen', `${50 + 70 * Math.sin(rad(v.ry))}%`);
    }
    for (const sh of shades.current) {
      const turn = sh.group ? angle(sh.group) : 0;
      const value = Math.round(shade(sh.n, v, turn) * sh.k * 1000) / 1000;
      if (value !== sh.last) {
        sh.last = value;
        sh.el.style.opacity = String(value);
      }
    }
    const rounded = Math.round(p);
    if (rounded !== slotRef.current) {
      slotRef.current = rounded;
      setSlot(rounded);
    }
  }, []);

  /** Collects the lit faces again: call after the model's planes change. */
  const rescan = useCallback(() => {
    shades.current = Array.from(stage.current?.querySelectorAll<HTMLElement>('[data-n]') ?? []).map((el) => ({
      el,
      n: el.dataset.n!.split(',').map(Number) as unknown as Vec,
      group: el.dataset.group,
      k: el.dataset.k ? Number(el.dataset.k) : 1,
      last: -1,
    }));
    apply();
  }, [apply]);

  // The frame calls itself through a ref: a function cannot reference itself while it is being declared.
  const frame = useRef<(now: number) => void>(() => {});
  const tick = useCallback(
    (now: number) => {
      const mo = motion.current;
      const v = view.current;
      const dt = Math.min(48, now - (mo.last || now));
      mo.last = now;
      let moving = false;
      if (mo.anim) {
        const a = mo.anim;
        const k = clamp((now - a.t0) / a.dur, 0, 1);
        const e = easeInOut(k);
        v.rx = a.from.rx + (a.to.rx - a.from.rx) * e;
        v.ry = a.from.ry + (a.to.ry - a.from.ry) * e;
        v.zoom = a.from.zoom + (a.to.zoom - a.from.zoom) * e;
        if (k >= 1) mo.anim = null;
        moving = true;
      } else if (!mo.dragging && (Math.abs(mo.vx) > 0.002 || Math.abs(mo.vy) > 0.002)) {
        // Inertia after a throw.
        v.ry += mo.vx * dt;
        v.rx = clamp(v.rx + mo.vy * dt, -TILT_LIMIT, TILT_LIMIT);
        const decay = Math.exp(-dt / 260);
        mo.vx *= decay;
        mo.vy *= decay;
        moving = true;
      } else if (!mo.dragging && mo.auto && !mo.move && pos.current < 0.001) {
        // The closed product turns slowly by itself; an open one is being read, so it stays still.
        v.ry += 0.014 * dt;
        moving = true;
      }
      if (mo.move) {
        const m = mo.move;
        const k = clamp((now - m.t0) / m.dur, 0, 1);
        pos.current = m.from + (m.to - m.from) * easeInOut(k);
        if (k >= 1) mo.move = null;
        moving = true;
      }
      apply();
      // Off screen and on a hidden tab no frames are needed: the loop sleeps and wakes up on events.
      if (moving && mo.visible && !document.hidden) mo.raf = requestAnimationFrame((t) => frame.current(t));
      else {
        mo.raf = 0;
        mo.last = 0;
      }
    },
    [apply],
  );
  useEffect(() => {
    frame.current = tick;
  }, [tick]);
  const kick = useCallback(() => {
    const mo = motion.current;
    if (!mo.raf) {
      mo.last = 0;
      mo.raf = requestAnimationFrame((t) => frame.current(t));
    }
  }, []);

  useEffect(() => {
    const mo = motion.current;
    if (prefersReducedMotion()) {
      mo.auto = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- once on mount: the button follows the system setting
      setAuto(false);
    }
    const el = stage.current;
    const io = el
      ? new IntersectionObserver(([entry]) => {
          mo.visible = entry?.isIntersecting ?? true;
          if (mo.visible) kick();
        })
      : null;
    if (el) io?.observe(el);
    const onVisibility = () => !document.hidden && kick();
    document.addEventListener('visibilitychange', onVisibility);
    kick();
    return () => {
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(mo.raf);
      mo.raf = 0;
    };
  }, [kick]);

  // Ctrl/⌘ + wheel zooms; a plain wheel keeps scrolling the page.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      view.current.zoom = clamp(view.current.zoom * Math.exp(-e.deltaY * 0.0025), ZOOM.min, ZOOM.max);
      apply();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [apply]);

  const stopAuto = useCallback(() => {
    motion.current.auto = false;
    setAuto(false);
  }, []);
  const toggleAuto = useCallback(() => {
    const mo = motion.current;
    mo.auto = !mo.auto;
    setAuto(mo.auto);
    if (mo.auto) kick();
  }, [kick]);

  const animateTo = useCallback(
    (to: Partial<View>) => {
      const v = view.current;
      const mo = motion.current;
      mo.vx = mo.vy = 0;
      const ry = to.ry ?? v.ry;
      const next = {
        rx: clamp(to.rx ?? v.rx, -TILT_LIMIT, TILT_LIMIT),
        ry: v.ry + shortestDelta(v.ry, ry),
        zoom: clamp(to.zoom ?? v.zoom, ZOOM.min, ZOOM.max),
      };
      if (prefersReducedMotion()) {
        Object.assign(v, next);
        apply();
        return;
      }
      mo.anim = { from: { ...v }, to: next, t0: performance.now(), dur: 700 };
      kick();
    },
    [apply, kick],
  );

  /** Moves to position n; opening a closed model turns it to the viewer. */
  const goTo = useCallback(
    (n: number) => {
      const o = opts.current;
      const mo = motion.current;
      const to = Math.round(clamp(n, 0, o.maxPos));
      const from = pos.current;
      target.current = to;
      setDest(to);
      const closed = (x: number) => x < 0.5 || (!!o.closedAtEnd && x > o.maxPos - 0.5);
      if (closed(from) && !closed(to)) {
        const v = view.current;
        if (Math.abs(shortestDelta(v.ry, o.openView.ry)) > 8 || Math.abs(v.rx - o.openView.rx) > 20) {
          animateTo({ ...o.openView, zoom: Math.max(v.zoom, o.openView.zoom) });
        }
      }
      if (to === from) return;
      if (prefersReducedMotion()) {
        mo.move = null;
        pos.current = to;
        apply();
        return;
      }
      mo.move = { from, to, t0: performance.now(), dur: o.duration(from, to) };
      kick();
    },
    [animateTo, apply, kick],
  );

  // ---------- Gestures: drag turns, pinch zooms, a tap on a face acts ----------
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = pointers.current;
    const mo = motion.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    p.map.set(e.pointerId, { x: e.clientX, y: e.clientY });
    mo.dragging = true;
    mo.anim = null;
    mo.vx = mo.vy = 0;
    stopAuto();
    if (p.map.size === 1) {
      const tap = (e.target as HTMLElement).closest<HTMLElement>('[data-tap]')?.dataset.tap ?? null;
      p.start = { x: e.clientX, y: e.clientY, tap, moved: false };
    } else if (p.start) {
      p.start.moved = true;
    }
    p.last = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    if (p.map.size === 2) {
      const [a, b] = [...p.map.values()];
      p.pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, zoom: view.current.zoom };
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = pointers.current;
    if (!p.map.has(e.pointerId)) return;
    p.map.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = view.current;
    if (p.map.size >= 2 && p.pinch) {
      const [a, b] = [...p.map.values()];
      v.zoom = clamp(p.pinch.zoom * (Math.hypot(a!.x - b!.x, a!.y - b!.y) / p.pinch.dist), ZOOM.min, ZOOM.max);
      apply();
      return;
    }
    if (!p.last || !p.start) return;
    // Until the finger passes the threshold this may still be a tap: the model does not move.
    if (!p.start.moved) {
      if (Math.hypot(e.clientX - p.start.x, e.clientY - p.start.y) < 6) return;
      p.start.moved = true;
      p.last = { t: e.timeStamp, x: e.clientX, y: e.clientY };
      return;
    }
    const dx = e.clientX - p.last.x;
    const dy = e.clientY - p.last.y;
    const dt = Math.max(1, e.timeStamp - p.last.t);
    v.ry += dx * 0.4;
    v.rx = clamp(v.rx - dy * 0.4, -TILT_LIMIT, TILT_LIMIT);
    const mo = motion.current;
    if (!prefersReducedMotion()) {
      mo.vx = 0.8 * mo.vx + 0.2 * ((dx * 0.4) / dt);
      mo.vy = 0.8 * mo.vy + 0.2 * ((-dy * 0.4) / dt);
    }
    p.last = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    apply();
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const p = pointers.current;
    p.map.delete(e.pointerId);
    p.pinch = null;
    if (p.map.size === 0) {
      const mo = motion.current;
      mo.dragging = false;
      const start = p.start;
      p.start = null;
      if (start && !start.moved && start.tap && !cancelled) opts.current.onTap(start.tap);
      else if (cancelled || (p.last && e.timeStamp - p.last.t > 80)) mo.vx = mo.vy = 0;
      p.last = null;
      kick();
    } else {
      const [rest] = [...p.map.values()];
      p.last = { t: e.timeStamp, x: rest!.x, y: rest!.y };
    }
  };

  const zoomBy = (factor: number) => {
    stopAuto();
    animateTo({ zoom: view.current.zoom * factor });
  };
  const reset = () => {
    stopAuto();
    animateTo({ ...opts.current.initial, zoom: 1 });
  };

  /** ←/→ move, Shift+←/→ turn, ↑/↓ tilt, Home/End, +/− zoom, 0 resets. */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const v = view.current;
    const step = 10;
    const map: Record<string, () => void> = {
      ArrowRight: () => (e.shiftKey ? animateTo({ ry: v.ry + step }) : goTo(target.current + 1)),
      ArrowLeft: () => (e.shiftKey ? animateTo({ ry: v.ry - step }) : goTo(target.current - 1)),
      ArrowUp: () => animateTo({ rx: v.rx + step }),
      ArrowDown: () => animateTo({ rx: v.rx - step }),
      PageDown: () => goTo(target.current + 1),
      PageUp: () => goTo(target.current - 1),
      Home: () => goTo(0),
      End: () => goTo(opts.current.maxPos),
      '+': () => animateTo({ zoom: v.zoom * ZOOM.step }),
      '=': () => animateTo({ zoom: v.zoom * ZOOM.step }),
      '-': () => animateTo({ zoom: v.zoom / ZOOM.step }),
      '0': () => animateTo({ ...opts.current.initial, zoom: 1 }),
    };
    const run = map[e.key];
    if (!run) return;
    e.preventDefault();
    stopAuto();
    run();
  };

  return {
    stage,
    orbit,
    slot,
    dest,
    auto,
    target,
    goTo: (n: number) => {
      stopAuto();
      goTo(n);
    },
    view: (to: Partial<View>) => {
      stopAuto();
      animateTo(to);
    },
    zoomBy,
    reset,
    toggleAuto,
    rescan,
    handlers: {
      onKeyDown,
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: PointerEvent<HTMLDivElement>) => onPointerUp(e),
      onPointerCancel: (e: PointerEvent<HTMLDivElement>) => onPointerUp(e, true),
    },
  };
}

/** Angle difference the short way round: −180…180. */
function shortestDelta(from: number, to: number) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

// ---------- Frame ----------

/**
 * The frame of the model: square on phones, 5:4 wider up. `extent` is the largest size of the model (mm); `ground` —
 * width and depth of the soft shadow under it.
 */
export function StageFrame({
  stage,
  orbit,
  handlers,
  extent,
  label,
  ground,
  children,
}: {
  stage: RefObject<HTMLDivElement | null>;
  orbit: RefObject<HTMLDivElement | null>;
  handlers: ReturnType<typeof useStage>['handlers'];
  extent: number;
  label: string;
  ground: { top: number; w: number; h: number };
  children: ReactNode;
}) {
  return (
    <div
      ref={stage}
      role="group"
      aria-label={label}
      aria-roledescription="3D-модель"
      tabIndex={0}
      {...handlers}
      className="relative aspect-square w-full cursor-grab overflow-hidden rounded-card select-none focus-visible:outline-2 focus-visible:outline-offset-4 active:cursor-grabbing sm:aspect-[5/4]"
      style={
        {
          '--zoom': 1,
          '--u': `calc(min(100cqw, 100cqh) / ${Math.round(extent * 1.08)} * var(--zoom))`,
          containerType: 'size',
          // Vertical swipes keep scrolling the page on phones; horizontal ones turn the model.
          touchAction: 'pan-y',
          background: 'radial-gradient(ellipse at 50% 35%, #ffffff, color-mix(in oklab, var(--color-ink) 9%, #ffffff) 75%)',
        } as CSSProperties
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/35 blur-2xl"
        style={{ top: `calc(50% + ${L(ground.top)})`, width: L(ground.w), height: L(ground.h), opacity: 'calc(var(--ground, 1) * 0.8)' }}
      />
      <div className="absolute inset-0" style={{ perspective: `calc(${Math.round(extent * 3.4)} * var(--u))` }}>
        <div ref={orbit} className="absolute top-1/2 left-1/2 size-0" style={preserve}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------- Controls ----------

const tool =
  'inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-control border-2 border-ink/15 bg-surface px-3 text-[14px] font-medium text-ink transition-colors hover:border-ink disabled:pointer-events-none disabled:opacity-40 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-bg';

export function ToolButton({ label, pressed, className, children, ...props }: { label?: string; pressed?: boolean; children: ReactNode } & ComponentProps<'button'>) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={pressed} className={cn(tool, className)} {...props}>
      {children}
    </button>
  );
}

/** Zoom, auto-rotation and reset: the same for every product. */
export function ViewTools({ zoomBy, auto, toggleAuto, reset }: Pick<ReturnType<typeof useStage>, 'zoomBy' | 'auto' | 'toggleAuto' | 'reset'>) {
  return (
    <>
      <span className="mx-1 hidden h-5 w-px bg-ink/15 sm:block" aria-hidden />
      <ToolButton label="Отдалить" onClick={() => zoomBy(1 / ZOOM.step)}>
        −
      </ToolButton>
      <ToolButton label="Приблизить" onClick={() => zoomBy(ZOOM.step)}>
        +
      </ToolButton>
      <ToolButton label={auto ? 'Остановить вращение' : 'Вращать'} pressed={auto} onClick={toggleAuto}>
        ⟳
      </ToolButton>
      <ToolButton label="Исходный вид" onClick={reset}>
        ⌂
      </ToolButton>
    </>
  );
}
