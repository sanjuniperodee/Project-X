import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PaymentKind } from '@px/contracts';
import { findBrand } from '@/brands';
import { Workspace } from '@/features/workspace/workspace';
import { api } from '@/shared/api/server';
import { ApiError } from '@/shared/api/core';
import { getBrandLinks } from '@/shared/lib/brand-server';
import { Container } from '@/shared/ui/container';

interface Props {
  params: Promise<{ brand: string; editKey: string }>;
  searchParams: Promise<{ payment?: string }>;
}

// The edit key is a secret: keep the workspace out of search engines and referrers.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function WorkspacePage({ params, searchParams }: Props) {
  const { brand: segment, editKey } = await params;
  const brand = findBrand(segment);
  if (!brand) notFound();

  const project = await api.project(editKey).catch((error: unknown) => {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  });
  if (project.productId !== brand.id) notFound();

  const [product, links] = await Promise.all([api.product(brand.id), getBrandLinks(brand.id)]);
  const inviteUrl = links.absolute(`/invite/${project.inviteKey}`);
  const payment = PaymentKind.safeParse((await searchParams).payment);

  return (
    <Container wide className="py-10 lg:py-14">
      <Workspace
        key={project.updatedAt}
        editKey={editKey}
        initialProject={project}
        product={product}
        inviteUrl={inviteUrl}
        returnedFrom={payment.success ? payment.data : null}
        copy={{
          title: brand.copy.workspaceTitle(project.subject),
          submitLabel: brand.copy.submitLabel,
          submitHint: brand.copy.submitHint,
          inviteMessage: brand.copy.inviteMessage(project.subject, inviteUrl),
          draftCardsTitle: brand.copy.draftCardsTitle,
        }}
      />
    </Container>
  );
}
