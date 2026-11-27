import Link from 'next/link';

/** "1–50 из 132" with previous / next links built by the caller. */
export function Pagination({ offset, limit, total, href }: { offset: number; limit: number; total: number; href: (offset: number) => string }) {
  if (total <= limit && offset === 0) return null;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <nav aria-label="Страницы" className="flex items-center justify-between gap-4 px-3 py-2.5 text-[13px] text-muted">
      <span>
        {from}–{to} из {total}
      </span>
      <span className="flex gap-1">
        {offset > 0 ? (
          <Link href={href(Math.max(0, offset - limit))} className="rounded-control border border-line bg-surface px-2.5 py-1 text-ink hover:bg-bg">
            Назад
          </Link>
        ) : null}
        {to < total ? (
          <Link href={href(offset + limit)} className="rounded-control border border-line bg-surface px-2.5 py-1 text-ink hover:bg-bg">
            Дальше
          </Link>
        ) : null}
      </span>
    </nav>
  );
}
