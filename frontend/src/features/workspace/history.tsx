import { PROJECT_STATUS_LABELS, type StatusChange } from '@px/contracts';
import { formatDate } from '@/shared/lib/plural';

export function History({ items }: { items: StatusChange[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="history-title">
      <h2 id="history-title" className="font-display text-xl font-semibold">
        История заказа
      </h2>
      <ol className="mt-4 space-y-3 border-l border-line pl-5">
        {[...items].reverse().map((item) => (
          <li key={`${item.to}-${item.createdAt}`} className="text-[15px]">
            <p className="font-medium">{PROJECT_STATUS_LABELS[item.to]}</p>
            <p className="text-sm text-muted">{formatDate(item.createdAt)}</p>
            {item.note && <p className="mt-1 leading-relaxed">{item.note}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
