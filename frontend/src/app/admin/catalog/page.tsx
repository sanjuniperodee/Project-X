import { formatTenge } from '@px/contracts';
import { CatalogPhotos } from '@/features/admin/catalog/photos';
import { SyncButton } from '@/features/admin/catalog/sync-button';
import { PageHeader } from '@/features/admin/ui/page-header';
import { Panel } from '@/features/admin/ui/panel';
import { getScope } from '@/features/admin/scope/scope';
import { api } from '@/shared/api/server';
import { Notice } from '@/shared/ui/notice';

export const dynamic = 'force-dynamic';

const REVIEW = {
  none: { label: 'нет в WhatsApp', tone: 'text-muted' },
  pending: { label: 'на проверке WhatsApp', tone: 'text-muted' },
  approved: { label: 'одобрен — бот присылает карточку', tone: 'text-success' },
  rejected: { label: 'отклонён WhatsApp', tone: 'text-danger' },
  outdated: { label: 'на повторной проверке', tone: 'text-muted' },
  unknown: { label: 'статус неизвестен', tone: 'text-muted' },
} as const;

export default async function CatalogPage() {
  const [status, scope] = await Promise.all([api.admin.catalog.status(), getScope()]);
  // In one project's mode only its products; the sync still covers the whole catalogue.
  const products = scope ? status.products.filter((p) => p.productId === scope) : status.products;
  const items = scope ? status.items.filter((i) => i.productId === scope) : status.items;
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader
        title="Каталог WhatsApp"
        description="Каждый формат — товар в каталоге WhatsApp Business студии. ИИ-продажник присылает клиентам карточки одобренных товаров."
      />
      {status.problem && <Notice tone="danger">{status.problem}</Notice>}
      <Panel title="Фото продуктов" aside="Общие для всех форматов продукта; без фото WhatsApp товар не примет">
        <div className="flex flex-col gap-6">
          {products.map((p) => (
            <div key={p.productId} className="flex flex-col gap-2">
              <div className="font-medium">
                {p.productName} {p.pending && <span className="text-xs text-muted">· новые фото уйдут при синхронизации</span>}
              </div>
              <CatalogPhotos productId={p.productId} images={p.images} />
            </div>
          ))}
        </div>
      </Panel>
      <Panel
        title="Товары"
        aside={status.catalogUrl ? <a href={status.catalogUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">Открыть каталог</a> : undefined}
      >
        <ul className="mb-4 divide-y divide-line">
          {items.map((i) => (
            <li key={`${i.productId}:${i.formatId}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {i.name} <span className="text-muted">· {formatTenge(i.price)}</span>
              </span>
              <span className={`text-sm ${REVIEW[i.review].tone}`}>
                {REVIEW[i.review].label}
                {i.outdated && ' · цена или описание изменились'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mb-4 text-sm text-muted">
          Синхронизация создаёт недостающие товары, правит изменившиеся и убирает форматы, которых больше нет. Каждая правка снова
          отправляет товар на проверку WhatsApp. Товары, добавленные вручную в приложении, не трогаются.
          {status.lastSyncAt && ` Последняя синхронизация: ${new Date(status.lastSyncAt).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}.`}
        </p>
        <SyncButton disabled={!status.available} />
      </Panel>
    </div>
  );
}
