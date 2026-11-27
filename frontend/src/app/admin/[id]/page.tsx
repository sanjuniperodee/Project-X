import { permanentRedirect } from 'next/navigation';

/** Old order links (/admin/<id>) keep working. */
export default async function LegacyOrderPage({ params }: { params: Promise<{ id: string }> }) {
  permanentRedirect(`/admin/orders/${(await params).id}`);
}
