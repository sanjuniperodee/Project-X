import { notFound } from 'next/navigation';
import { findBrand } from '@/brands';
import { CreateProjectForm } from '@/features/create-project/create-project-form';
import { api } from '@/shared/api/server';
import { Container } from '@/shared/ui/container';

export default async function CreatePage({ params }: { params: Promise<{ brand: string }> }) {
  const brand = findBrand((await params).brand);
  if (!brand) notFound();
  const product = await api.product(brand.id);
  const { subjectLabel, subjectPlaceholder, subjectHint } = brand.copy;

  return (
    <Container wide className="py-10 lg:py-16">
      <header className="mb-12 max-w-2xl">
        <h1 className="font-display text-5xl leading-none font-semibold lg:text-6xl">{brand.copy.createTitle}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">{brand.copy.createLead}</p>
      </header>
      <CreateProjectForm product={product} copy={{ subjectLabel, subjectPlaceholder, subjectHint }} />
    </Container>
  );
}
