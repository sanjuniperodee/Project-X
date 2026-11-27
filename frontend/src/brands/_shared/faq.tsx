import { cn } from '@/shared/lib/cn';

export interface FaqItem {
  q: string;
  a: string;
}

/** Native disclosure list: accessible and works without JavaScript. */
export function Faq({ items, className, itemClassName }: { items: FaqItem[]; className?: string; itemClassName?: string }) {
  return (
    <div className={cn('divide-y divide-current/20 border-y border-current/20', className)}>
      {items.map((item) => (
        <details key={item.q} className={cn('group py-5', itemClassName)}>
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-lg font-medium [&::-webkit-details-marker]:hidden">
            {item.q}
            <span aria-hidden className="mt-1 shrink-0 text-xl leading-none transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-3 max-w-[65ch] leading-relaxed opacity-80">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
