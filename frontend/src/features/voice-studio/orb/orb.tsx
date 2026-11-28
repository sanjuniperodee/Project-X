'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import type { VoicePhase } from '../session/types';
import { OrbRenderer } from './renderer';

export interface OrbProps {
  phase: VoicePhase;
  /** Current loudness of the microphone and of the assistant's voice, 0…1. */
  levels: () => { input: number; output: number };
  /** Hot colour of the orb, from the brand's accent (hex). */
  accent: string;
  className?: string;
}

const COOL: [number, number, number] = [0.36, 0.42, 1.0];

/**
 * The assistant made visible. It breathes when idle, leans in while it listens (the mesh
 * follows the microphone), swirls while it thinks and pulses with its own voice.
 */
export function Orb({ phase, levels, accent, className }: OrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  // The loop reads the latest props without restarting.
  const live = useRef({ phase, levels, accent });
  useEffect(() => {
    live.current = { phase, levels, accent };
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    let renderer: OrbRenderer;
    try {
      renderer = new OrbRenderer(canvas, window.innerWidth < 640 ? 900 : 1500);
    } catch (error) {
      // No WebGL (old phone, blocked GPU): a CSS orb stands in.
      console.warn('Voice orb falls back to CSS:', error);
      queueMicrotask(() => setFallback(true));
      return;
    }
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const observer = new ResizeObserver(() => renderer.resize());
    observer.observe(canvas);
    renderer.resize();

    let frame = 0;
    let level = 0;
    let speak = 0;
    let think = 0;
    let clock = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { phase: current, levels: read, accent: hex } = live.current;
      const { input, output } = read();
      const heard = current === 'speaking' ? output : current === 'listening' ? input : 0;
      // Fast attack, slow release: the orb jumps with a word and settles after it.
      const target = Math.min(1, heard * (calm ? 0.5 : 1.25));
      level += (target - level) * (target > level ? 0.35 : 0.08);
      speak += ((current === 'speaking' ? 1 : 0) - speak) * 0.08;
      think += ((current === 'thinking' || current === 'connecting' ? 1 : 0) - think) * 0.06;
      clock += dt * (calm ? 0.35 : 1);
      renderer.render({ time: clock, level, speak, think, cool: COOL, hot: hexToRgb(hex) });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
    };
  }, []);

  return (
    <div className={cn('pointer-events-none', className)} aria-hidden>
      {fallback ? (
        <div
          className="absolute inset-[18%] animate-pulse rounded-full"
          style={{ background: `radial-gradient(circle at 50% 45%, #fff 0%, ${accent} 28%, #3b46ff 62%, transparent 72%)`, filter: 'blur(6px)' }}
        />
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      )}
    </div>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? 'e4007c';
  const n = Number.parseInt(value, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
