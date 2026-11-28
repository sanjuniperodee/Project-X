import type { ProductId } from '@px/contracts';
import { cn } from '@/shared/lib/cn';
import { project, PROJECTS } from './projects';

/** The project's monogram tile; `null` shows the three projects together (all projects). */
export function ProjectMark({ id, size = 24, className }: { id: ProductId | null; size?: number; className?: string }) {
  if (!id) {
    return (
      <span aria-hidden className={cn('grid shrink-0 grid-cols-2 gap-[2px] rounded-[7px] bg-ink p-[4px]', className)} style={{ width: size, height: size }}>
        {[...PROJECTS, null].map((p, i) => (
          <span key={i} className="rounded-[2px]" style={{ background: p ? p.color : 'rgba(255,255,255,0.85)' }} />
        ))}
      </span>
    );
  }
  const p = project(id);
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-[7px] font-semibold text-white', className)}
      style={{ width: size, height: size, background: p.color, fontSize: Math.round(size * (p.monogram.length > 1 ? 0.38 : 0.5)), letterSpacing: '-0.02em' }}
    >
      {p.monogram}
    </span>
  );
}

/** A small coloured dot with the project's name: identity is never colour alone. */
export function ProjectLabel({ id, className }: { id: ProductId; className?: string }) {
  const p = project(id);
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: p.color }} />
      {p.name}
    </span>
  );
}
