import { formatTenge, type PaymentView } from '@px/contracts';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '../lib/format';

const KIND = { deposit: 'Предоплата', balance: 'Остаток' } as const;
const STATUS = { pending: 'ожидает', succeeded: 'оплачен', failed: 'ошибка', cancelled: 'отменён' } as const;

/** Every payment attempt of the order: what was billed, how and whether it went through. */
export function Payments({ items }: { items: PaymentView[] | null }) {
  if (items === null) return <p className="text-muted">Платежи сейчас недоступны.</p>;
  if (items.length === 0) return <p className="text-muted">Счетов ещё не выставляли.</p>;
  return (
    <ol className="flex flex-col divide-y divide-line">
      {items.map((p) => (
        <li key={p.id} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <span className="min-w-0">
            {KIND[p.kind]}
            <span className="block text-[12px] text-muted">
              {formatDateTime(p.paidAt ?? p.createdAt)} · {p.provider}
            </span>
          </span>
          <span className="text-right whitespace-nowrap">
            {formatTenge(p.amount)}
            <span className={cn('block text-[12px]', p.status === 'succeeded' ? 'text-emerald-700' : p.status === 'pending' ? 'text-muted' : 'text-red-700')}>
              {STATUS[p.status]}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
