import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

type Tone = 'info' | 'success' | 'danger';

const tones: Record<Tone, string> = {
  info: 'border-line bg-surface',
  success: 'border-success/40 bg-success/5 text-success',
  danger: 'border-danger/40 bg-danger/5 text-danger',
};

export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-card border px-4 py-3 text-[15px]', tones[tone])}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(title && 'mt-1', 'leading-relaxed')}>{children}</div>}
    </div>
  );
}
