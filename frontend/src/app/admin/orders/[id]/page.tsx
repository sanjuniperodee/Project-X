import { notFound } from 'next/navigation';
import { OrderView } from '@/features/admin/order/order-view';
import { ApiError } from '@/shared/api/core';
import { api } from '@/shared/api/server';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await api.admin.project(id).catch((error: unknown) => {
    if (error instanceof ApiError && (error.isNotFound || error.status === 422)) notFound();
    throw error;
  });
  const [product, payments] = await Promise.all([
    api.product(project.productId),
    // Payments live in another service: the order page still works when it is down.
    api.admin.payments(project.id).catch(() => null),
  ]);
  return <OrderView project={project} product={product} payments={payments} />;
}
