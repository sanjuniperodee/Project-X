'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import type { VoicePhase } from '../session/types';

/** One round glass button of the control bar. */
export function RoundButton({
  label,
  active,
  onClick,
  children,
  className,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        'grid size-13 place-items-center rounded-full border backdrop-blur-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        active ? 'border-white bg-white text-black' : 'border-line bg-surface text-ink hover:bg-white/15',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PillButton({
  children,
  onClick,
  tone = 'ghost',
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'solid' | 'ghost';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-13 items-center justify-center gap-2 rounded-full px-7 text-[15px] font-semibold transition-colors disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        tone === 'solid' ? 'bg-white text-black hover:bg-accent hover:text-accent-ink' : 'border border-line bg-surface text-ink backdrop-blur-md hover:bg-white/15',
        className,
      )}
    >
      {children}
    </button>
  );
}

const PHASE_LABEL: Record<VoicePhase, string> = {
  idle: '',
  connecting: 'Соединяю',
  listening: 'Слушаю',
  thinking: 'Думаю',
  speaking: 'Говорю',
};

/** What the assistant says, in the brand's display face, word after word; under it, what it heard. */
export function Caption({ phase, assistant, user, typedOnly }: { phase: VoicePhase; assistant: string; user: { text: string; final: boolean } | null; typedOnly: boolean }) {
  const words = assistant.split(/\s+/).filter(Boolean);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-5 text-center">
      <p className="h-5 text-sm text-muted" aria-live="polite">
        {phase === 'listening' && typedOnly ? 'Жду ваш ответ текстом' : PHASE_LABEL[phase]}
        {(phase === 'connecting' || phase === 'thinking') && <span className="animate-pulse">…</span>}
      </p>
      <p
        key={assistant}
        data-voice-line
        // Long lines are set smaller so they never climb over the orb.
        className={cn('font-display leading-[1.18] text-balance italic', assistant.length > 110 ? 'text-[clamp(1.05rem,1.9vw,1.5rem)]' : 'text-[clamp(1.35rem,3vw,2.35rem)]')}
        aria-live="polite"
      >
        {words.map((word, i) => (
          <span key={i} className="voice-word" style={{ animationDelay: `${Math.min(i * 45, 2200)}ms` }}>
            {word}&nbsp;
          </span>
        ))}
      </p>
      <p className={cn('min-h-6 max-w-xl text-[15px] leading-snug text-balance', user?.final ? 'text-muted' : 'text-ink/85')}>{user?.text}</p>
    </div>
  );
}

export interface Fact {
  id: number;
  label: string;
  value: string;
}

/** What is already in the issue: the newest fact on top, older ones fading out. */
export function Facts({ facts, answered, total }: { facts: Fact[]; answered: number; total: number }) {
  return (
    <aside aria-label="Что уже записано" className="flex w-full flex-col gap-4">
      <div>
        <p className="text-sm text-muted">Записано</p>
        <p className="font-display text-4xl leading-none tabular-nums">
          {answered}
          <span className="text-xl text-muted"> из {total}</span>
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {facts.slice(0, 6).map((fact, i) => (
          <li key={fact.id} className="voice-fact border-l-2 pl-3" style={{ opacity: 1 - i * 0.15, borderColor: i === 0 ? 'var(--c-accent)' : 'var(--c-line)' }}>
            <p className="text-xs text-muted">{fact.label}</p>
            <p className="line-clamp-2 text-[15px] leading-snug">{fact.value}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export const Icon = {
  mic: (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  ),
  micOff: (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M9 9v2a3 3 0 0 0 4.6 2.5M15 10V6a3 3 0 0 0-5.7-1.3M5.5 11a6.5 6.5 0 0 0 10.2 5.3M18.5 11a6.5 6.5 0 0 1-.6 2.7M12 17.5V21M4 3l16 18" />
    </svg>
  ),
  keyboard: (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" />
    </svg>
  ),
  photo: (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 17 5-4 4 3 3-2.5 4 3.5" />
    </svg>
  ),
  close: (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
};
