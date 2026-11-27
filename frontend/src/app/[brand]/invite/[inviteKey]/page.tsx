import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { contributorSteps } from '@px/contracts';
import { findBrand } from '@/brands';
import { ContributionForm } from '@/features/invite/contribution-form';
import { api } from '@/shared/api/server';
import { ApiError } from '@/shared/api/core';
import { Container } from '@/shared/ui/container';

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function InvitePage({ params }: { params: Promise<{ brand: string; inviteKey: string }> }) {
  const { brand: segment, inviteKey } = await params;
  const brand = findBrand(segment);
  if (!brand) notFound();

  const invite = await api.invite(inviteKey).catch((error: unknown) => {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  });
  if (invite.productId !== brand.id) notFound();
  const product = await api.product(brand.id);
  const steps = contributorSteps(product);

  return (
    <Container className="max-w-3xl py-10 lg:py-16">
      <p className="text-muted">{invite.ownerName} приглашает вас</p>
      <h1 className="mt-3 font-display text-4xl leading-tight font-semibold sm:text-5xl">{product.collaboration.inviteTitle}</h1>
      <p className="mt-5 max-w-[60ch] text-lg leading-relaxed">
        {product.collaboration.inviteDescription} Проект: <strong className="font-semibold">{invite.subject}</strong>.
      </p>
      <div className="mt-12">
        {invite.acceptingContributions && steps.length > 0 ? (
          <ContributionForm inviteKey={inviteKey} steps={steps} thanks={brand.copy.contributionThanks} />
        ) : (
          <div className="rounded-card border border-line p-6">
            <p className="text-lg font-medium">Сбор историй уже закончился</p>
            <p className="mt-2 leading-relaxed text-muted">
              Материалы переданы дизайнеру. Если очень хочется что-то добавить, напишите {invite.ownerName}.
            </p>
          </div>
        )}
      </div>
    </Container>
  );
}
