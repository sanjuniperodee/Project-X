import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { findBrand } from '@/brands';
import { LayoutPages } from '@/features/workspace/layout-pages';
import { api } from '@/shared/api/server';
import { ApiError } from '@/shared/api/core';
import { getBrandLinks } from '@/shared/lib/brand-server';
import { ButtonLink } from '@/shared/ui/button';
import { Container } from '@/shared/ui/container';

// Reached by the QR code on the back cover; the link is private to the party, not for search engines.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };

/** The online version of a printed issue: guests leaf through it and can order one of their own. */
export default async function IssuePage({ params }: { params: Promise<{ brand: string; inviteKey: string }> }) {
  const { brand: segment, inviteKey } = await params;
  const brand = findBrand(segment);
  if (!brand) notFound();

  const issue = await api.issue(inviteKey).catch((error: unknown) => {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  });
  if (issue.productId !== brand.id) notFound();
  const links = await getBrandLinks(brand.id);

  return (
    <Container wide className="py-10 lg:py-14">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-muted">{brand.name}</p>
          <h1 className="mt-2 font-display text-4xl leading-tight font-semibold sm:text-6xl">{issue.subject}</h1>
        </div>
        <ButtonLink href={links.href('/')} variant="secondary">
          Что это за журнал
        </ButtonLink>
      </header>

      {issue.ready ? (
        <LayoutPages pages={issue.pages} spreads={issue.pages.every((p) => p.widthMm === issue.pages[0]!.widthMm)} />
      ) : (
        <div className="rounded-card border border-line p-6">
          <p className="text-lg font-medium">Номер ещё в редакции</p>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-muted">
            Здесь появятся все страницы, когда макет согласуют и отправят в печать.
            {issue.acceptingContributions && ' А пока можно успеть добавить свою историю.'}
          </p>
          {issue.acceptingContributions && (
            <ButtonLink href={links.href(`/invite/${inviteKey}`)} className="mt-5">
              Написать историю для номера
            </ButtonLink>
          )}
        </div>
      )}

      <aside className="mt-14 flex flex-wrap items-center justify-between gap-6 rounded-card border-2 border-ink p-6 sm:p-8">
        <div className="max-w-[52ch]">
          <h2 className="font-display text-3xl leading-tight font-semibold">Такой же — про вашего человека</h2>
          <p className="mt-2 leading-relaxed text-muted">
            Отвечаете на вопросы, друзья добавляют истории, мы верстаем и печатаем. Обложку можно примерить прямо сейчас.
          </p>
        </div>
        <ButtonLink href={links.href('/create')} size="lg">
          {brand.cta}
        </ButtonLink>
      </aside>
    </Container>
  );
}
