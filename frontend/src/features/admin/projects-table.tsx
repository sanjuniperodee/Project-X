import Link from 'next/link';
import { formatTenge, PROJECT_STATUS_LABELS, ProjectStatus, type ProjectListItem } from '@px/contracts';
import { getBrand } from '@/brands';
import { cn } from '@/shared/lib/cn';
import { formatDate } from '@/shared/lib/plural';

export function ProjectsTable({ items, status }: { items: ProjectListItem[]; status: ProjectStatus | null }) {
  const filters: (ProjectStatus | null)[] = [null, ...ProjectStatus.options];
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Заказы</h1>
      <nav aria-label="Фильтр по статусу" className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Link
            key={f ?? 'all'}
            href={f ? `/admin?status=${f}` : '/admin'}
            aria-current={f === status ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm',
              f === status ? 'border-ink bg-ink text-white' : 'border-line bg-surface hover:border-ink',
            )}
          >
            {f ? PROJECT_STATUS_LABELS[f] : 'Все'}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-6 text-muted">В этом статусе заказов нет.</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Проект</th>
                <th className="px-4 py-3 font-medium">Продукт</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Клиент</th>
                <th className="px-4 py-3 text-right font-medium">Оплачено</th>
                <th className="px-4 py-3 text-right font-medium">Обновлён</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-bg">
                  <td className="px-4 py-3">
                    <Link href={`/admin/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                      {p.subject}
                    </Link>
                    {p.contributionsCount > 0 && <span className="ml-2 text-muted">+{p.contributionsCount}</span>}
                  </td>
                  <td className="px-4 py-3">{getBrand(p.productId).name}</td>
                  <td className="px-4 py-3">{PROJECT_STATUS_LABELS[p.status]}</td>
                  <td className="px-4 py-3">
                    {p.customerName}
                    <span className="block text-muted">{p.customerPhone}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatTenge(p.paidAmount)}
                    <span className="block text-muted">из {formatTenge(p.total)}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted">{formatDate(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
