import type { Field } from '@px/contracts';
import { formatDay } from '../lib/format';

/** One questionnaire answer rendered for reading: photos as thumbnails, lists as numbered items. */
export function AnswerValue({ field, value }: { field: Field; value: unknown }) {
  const empty = <span className="text-muted">—</span>;
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return empty;

  if (field.type === 'photos') {
    const photos = value as { id: string; url: string }[];
    return (
      <ul className="flex flex-wrap gap-1.5">
        {photos.map((p) => (
          <li key={p.id}>
            <a href={p.url} target="_blank" rel="noreferrer" className="block size-16 overflow-hidden rounded-[4px] border border-line bg-bg">
              {/* eslint-disable-next-line @next/next/no-img-element -- user uploads */}
              <img src={p.url} alt="" loading="lazy" className="size-full object-cover" />
            </a>
          </li>
        ))}
      </ul>
    );
  }
  if (field.type === 'list') {
    const items = value as Record<string, unknown>[];
    return (
      <ol className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="rounded-[4px] border border-line px-2.5 py-1.5">
            {field.fields.map((leaf) => (
              <div key={leaf.id} className="flex gap-2">
                <span className="shrink-0 text-muted">{leaf.label}:</span>
                <AnswerValue field={leaf} value={item[leaf.id]} />
              </div>
            ))}
          </li>
        ))}
      </ol>
    );
  }
  if (field.type === 'select' || field.type === 'choice') {
    const values = Array.isArray(value) ? value : [value];
    return <>{values.map((v) => field.options.find((o) => o.value === v)?.label ?? String(v)).join(', ')}</>;
  }
  if (field.type === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return <>{formatDay(value)}</>;
  return <span className="whitespace-pre-line">{String(value)}</span>;
}
