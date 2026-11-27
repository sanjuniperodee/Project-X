import { notFound } from 'next/navigation';
import { findBrand } from '@/brands';
import { api } from '@/shared/api/server';
import { getBrandLinks } from '@/shared/lib/brand-server';

export default async function BrandLandingPage({ params }: { params: Promise<{ brand: string }> }) {
  const brand = findBrand((await params).brand);
  if (!brand) notFound();
  const [product, links] = await Promise.all([api.product(brand.id), getBrandLinks(brand.id)]);
  return <brand.Landing product={product} href={links.href} />;
}
