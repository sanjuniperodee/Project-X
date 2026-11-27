import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { findBrand } from '@/brands';
import { BrandFooter } from '@/features/brand-shell/brand-footer';
import { BrandHeader } from '@/features/brand-shell/brand-header';
import { BrandProvider } from '@/shared/lib/brand-context';
import { getBrandLinks } from '@/shared/lib/brand-server';

interface Props {
  children: ReactNode;
  params: Promise<{ brand: string }>;
}

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const brand = findBrand((await params).brand);
  return brand ? { title: brand.metadata.title, description: brand.metadata.description } : {};
}

export default async function BrandLayout({ children, params }: Props) {
  const brand = findBrand((await params).brand);
  if (!brand) notFound();
  const links = await getBrandLinks(brand.id);

  return (
    <div data-brand={brand.id} className="flex min-h-dvh flex-col">
      <BrandProvider brand={brand.id} base={links.base}>
        <BrandHeader brand={brand} href={links.href} />
        <main className="flex-1">{children}</main>
        <BrandFooter brand={brand} />
      </BrandProvider>
    </div>
  );
}
