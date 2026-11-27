import { contributorSteps, type Contribution, type Product } from '@px/contracts';
import { formatDate } from '@/shared/lib/plural';

/** What invited people sent, shown to the owner. First text answers make a readable preview. */
export function Contributions({ product, items, noun }: { product: Product; items: Contribution[]; noun: string }) {
  if (items.length === 0) return null;
  const steps = contributorSteps(product);

  return (
    <section aria-labelledby="contrib-title">
      <h2 id="contrib-title" className="font-display text-3xl font-semibold">
        Что прислали {noun}
      </h2>
      <ul className="mt-6 grid gap-4 md:grid-cols-2">
        {items.map((c) => {
          const texts = steps.flatMap((step) =>
            step.fields
              .filter((f) => f.type === 'text' || f.type === 'textarea')
              .map((f) => ({ label: f.label, value: c.answers[step.id]?.[f.id] }))
              .filter((x): x is { label: string; value: string } => typeof x.value === 'string' && x.value.trim() !== ''),
          );
          const photos = steps.flatMap((step) =>
            step.fields.filter((f) => f.type === 'photos').flatMap((f) => (c.answers[step.id]?.[f.id] as { id: string; url: string }[] | undefined) ?? []),
          );
          return (
            <li key={c.id} className="rounded-card border border-line bg-surface p-5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-semibold">{c.authorName}</p>
                <p className="text-sm text-muted">{formatDate(c.createdAt)}</p>
              </div>
              <dl className="mt-3 space-y-2.5">
                {texts.map((t) => (
                  <div key={t.label}>
                    <dt className="text-sm text-muted">{t.label}</dt>
                    <dd className="mt-0.5 line-clamp-4 leading-relaxed whitespace-pre-line">{t.value}</dd>
                  </div>
                ))}
              </dl>
              {photos.length > 0 && (
                <ul className="mt-4 flex gap-2">
                  {photos.slice(0, 5).map((p) => (
                    <li key={p.id} className="size-14 overflow-hidden rounded-control bg-field">
                      {/* eslint-disable-next-line @next/next/no-img-element -- user uploads */}
                      <img src={p.url} alt="" className="size-full object-cover" loading="lazy" />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
