import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PaymentKind } from '@px/contracts';
import { findBrand } from '@/brands';
import { VoiceStudio } from '@/features/voice-studio/ui/studio';
import { api } from '@/shared/api/server';
import { ApiError } from '@/shared/api/core';
import { getBrandLinks } from '@/shared/lib/brand-server';

interface Props {
  params: Promise<{ brand: string; editKey: string }>;
  searchParams: Promise<{ payment?: string }>;
}

// The edit key is a secret: keep the studio out of search engines and referrers.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };

/** Voice studio: the questionnaire as a conversation, then the finished layout on the same screen. */
export default async function VoiceStudioPage({ params, searchParams }: Props) {
  const { brand: segment, editKey } = await params;
  const brand = findBrand(segment);
  if (!brand) notFound();

  const project = await api.project(editKey).catch((error: unknown) => {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  });
  if (project.productId !== brand.id) notFound();

  const [product, links] = await Promise.all([api.product(brand.id), getBrandLinks(brand.id)]);
  const payment = PaymentKind.safeParse((await searchParams).payment);
  const Preview = brand.VoicePreview;

  return (
    <VoiceStudio
      editKey={editKey}
      initialProject={project}
      product={product}
      workspaceHref={links.href(`/p/${editKey}`)}
      returnedFrom={payment.success ? payment.data : null}
      preview={Preview ? <Preview /> : undefined}
    />
  );
}
