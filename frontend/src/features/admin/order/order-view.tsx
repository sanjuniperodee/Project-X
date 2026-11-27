import Link from 'next/link';
import { formatTenge, type AdminProjectView, type PaymentView, type Product } from '@px/contracts';
import { getBrand } from '@/brands';
import { formatDateTime, formatPhone, whatsappLink } from '../lib/format';
import { STATUS_LABEL } from '../lib/status';
import { ActionLink } from '../ui/button-link';
import { CopyButton } from '../ui/copy-button';
import { Deadline } from '../ui/deadline';
import { PageHeader } from '../ui/page-header';
import { Facts, Panel } from '../ui/panel';
import { StatusBadge } from '../ui/status-badge';
import { Contributions, Materials } from './materials';
import { Layouts } from './layouts';
import { Notes } from './notes';
import { Payments } from './payments';
import { StatusControl } from './status-control';

/**
 * One order for the studio. Left: the work (layouts, materials, friends, AI draft).
 * Right: decisions and facts (status, customer, money, notes, history).
 */
export function OrderView({ project, product, payments }: { project: AdminProjectView; product: Product; payments: PaymentView[] | null }) {
  const brand = getBrand(project.productId);
  const due = project.quote.total - project.paidAmount;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: '/admin/orders', label: 'Заказы' }}
        title={project.subject}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={project.status} className="text-ink" />
            <span>{brand.name}</span>
            <span>создан {formatDateTime(project.createdAt)}</span>
            <span className="font-mono text-[12px]">#{project.id.slice(0, 8)}</span>
          </span>
        }
        actions={
          <>
            <ActionLink href={whatsappLink(project.customer.phone)} target="_blank">
              WhatsApp
            </ActionLink>
            <CopyButton text={`/${project.productId}/invite/${project.inviteKey}`} label="Ссылка для друзей" />
            <ActionLink href={`/${project.productId}/p/${project.editKey}`} target="_blank" primary>
              Кабинет клиента
            </ActionLink>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Layouts project={project} />
          <Materials project={project} product={product} />
          <Contributions project={project} product={product} />
          {project.draft && (
            <Panel title="Черновик текстов" aside={project.draft.generator}>
              <details>
                <summary className="cursor-pointer font-medium">{project.draft.title}</summary>
                <p className="mt-2 whitespace-pre-line text-muted">{project.draft.lead}</p>
                {project.draft.sections.map((section) => (
                  <div key={section.heading} className="mt-3">
                    <p className="font-medium">{section.heading}</p>
                    <p className="mt-0.5 whitespace-pre-line">{section.body}</p>
                  </div>
                ))}
              </details>
            </Panel>
          )}
        </div>

        <aside className="flex flex-col gap-5">
          <Panel title="Статус">
            <StatusControl projectId={project.id} status={project.status} />
          </Panel>
          <Panel title="Клиент" aside={<Link href={`/admin/customers/${encodeURIComponent(project.customer.phone.replace(/\D/g, ''))}`}>Все заказы</Link>}>
            <Facts
              items={[
                ['Имя', project.customer.name],
                [
                  'Телефон',
                  <a key="phone" href={whatsappLink(project.customer.phone)} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {formatPhone(project.customer.phone)}
                  </a>,
                ],
                ['Email', project.customer.email ?? <span className="text-muted">—</span>],
                ['Праздник', <Deadline key="deadline" date={project.deadline} />],
              ]}
            />
          </Panel>
          <Panel title="Сумма" aside={due > 0 ? `к оплате ${formatTenge(due)}` : 'оплачен полностью'}>
            <ul className="flex flex-col gap-1">
              {project.quote.lines.map((line) => (
                <li key={line.id} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    {line.name}
                    {line.quantity > 1 && <span className="text-muted"> × {line.quantity}</span>}
                  </span>
                  <span className="whitespace-nowrap">{formatTenge(line.total)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex justify-between border-t border-line pt-2 font-medium">
              <span>Оплачено</span>
              <span>
                {formatTenge(project.paidAmount)} <span className="font-normal text-muted">из {formatTenge(project.quote.total)}</span>
              </span>
            </p>
          </Panel>
          <Panel title="Платежи">
            <Payments items={payments} />
          </Panel>
          <Panel title="Заметки команды" aside={project.notes.length || undefined}>
            <Notes projectId={project.id} notes={project.notes} />
          </Panel>
          <Panel title="История">
            <ol className="flex flex-col gap-2">
              {[...project.history].reverse().map((h, i) => (
                <li key={i}>
                  <p>{STATUS_LABEL[h.to]}</p>
                  <p className="text-[12px] text-muted">
                    {formatDateTime(h.createdAt)}
                    {h.note ? ` · ${h.note}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
