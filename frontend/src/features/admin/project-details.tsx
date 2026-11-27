import Link from 'next/link';
import { formatTenge, PROJECT_STATUS_LABELS, type AdminProjectView, type Field, type Product } from '@px/contracts';
import { getBrand } from '@/brands';
import { DraftPreview } from '../workspace/draft-preview';
import { History } from '../workspace/history';
import { Contributions } from '../workspace/contributions';
import { StatusForm } from './status-form';

export function ProjectDetails({ project, product }: { project: AdminProjectView; product: Product }) {
  const brand = getBrand(project.productId);
  const whatsapp = `https://wa.me/${project.customer.phone.replace(/\D/g, '')}`;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <Link href="/admin" className="text-sm text-muted underline-offset-4 hover:underline">
            Все заказы
          </Link>
          <h1 className="mt-2 text-3xl font-semibold">{project.subject}</h1>
          <p className="mt-1 text-muted">
            {brand.name}, {PROJECT_STATUS_LABELS[project.status]}
          </p>
        </div>
        <Link
          href={`/${project.productId}/p/${project.editKey}`}
          target="_blank"
          className="rounded-control border border-line bg-surface px-4 py-2 text-sm hover:border-ink"
        >
          Открыть кабинет клиента
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="font-semibold">Клиент</h2>
          <p className="mt-3">{project.customer.name}</p>
          <a href={whatsapp} className="mt-1 block underline underline-offset-4" target="_blank" rel="noreferrer">
            {project.customer.phone}
          </a>
          {project.customer.email && <p className="mt-1 text-muted">{project.customer.email}</p>}
        </section>
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="font-semibold">Заказ</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {project.quote.lines.map((l) => (
              <li key={l.id} className="flex justify-between gap-4">
                <span>
                  {l.name} {l.quantity > 1 && `× ${l.quantity}`}
                </span>
                <span className="tabular-nums">{formatTenge(l.total)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between border-t border-line pt-3 font-medium">
            <span>Оплачено</span>
            <span className="tabular-nums">
              {formatTenge(project.paidAmount)} из {formatTenge(project.quote.total)}
            </span>
          </p>
        </section>
        <section className="rounded-card border border-line bg-surface p-5">
          <h2 className="mb-4 font-semibold">Статус</h2>
          <StatusForm projectId={project.id} status={project.status} />
        </section>
      </div>

      {project.draft && <DraftPreview draft={project.draft} cardsTitle={brand.copy.draftCardsTitle} />}

      <section className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold">Анкета</h2>
        {product.steps
          .filter((s) => s.audience === 'owner')
          .map((step) => (
            <div key={step.id} className="rounded-card border border-line bg-surface p-5">
              <h3 className="font-semibold">{step.title}</h3>
              <dl className="mt-4 grid gap-4 md:grid-cols-2">
                {step.fields.map((field) => (
                  <div key={field.id} className={field.type === 'list' || field.type === 'photos' ? 'md:col-span-2' : ''}>
                    <dt className="text-sm text-muted">{field.label}</dt>
                    <dd className="mt-1">
                      <AnswerValue field={field} value={project.answers[step.id]?.[field.id]} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
      </section>

      <Contributions product={product} items={project.contributions} noun={product.collaboration.contributorNoun} />
      <History items={project.history} />
    </div>
  );
}

function AnswerValue({ field, value }: { field: Field; value: unknown }) {
  const empty = <span className="text-muted">—</span>;
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return empty;

  if (field.type === 'photos') {
    const photos = value as { id: string; url: string }[];
    return (
      <ul className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <li key={p.id}>
            <a href={p.url} target="_blank" rel="noreferrer" className="block size-20 overflow-hidden rounded-control bg-bg">
              {/* eslint-disable-next-line @next/next/no-img-element -- user uploads */}
              <img src={p.url} alt="" className="size-full object-cover" />
            </a>
          </li>
        ))}
      </ul>
    );
  }
  if (field.type === 'list') {
    const items = value as Record<string, unknown>[];
    return (
      <ol className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="rounded-control bg-bg p-3 text-sm">
            {field.fields.map((leaf) => (
              <p key={leaf.id}>
                <span className="text-muted">{leaf.label}: </span>
                <AnswerValue field={leaf} value={item[leaf.id]} />
              </p>
            ))}
          </li>
        ))}
      </ol>
    );
  }
  if ((field.type === 'select' || field.type === 'choice') && field.options) {
    const values = Array.isArray(value) ? value : [value];
    return <>{values.map((v) => field.options.find((o) => o.value === v)?.label ?? String(v)).join(', ')}</>;
  }
  return <span className="whitespace-pre-line">{String(value)}</span>;
}
