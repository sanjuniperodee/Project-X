import { notFound } from 'next/navigation';
import { ProjectDetails } from '@/features/admin/project-details';
import { api } from '@/shared/api/server';
import { ApiError } from '@/shared/api/core';

export default async function AdminProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await api.admin.project(id).catch((error: unknown) => {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  });
  const product = await api.product(project.productId);
  return <ProjectDetails project={project} product={product} />;
}
