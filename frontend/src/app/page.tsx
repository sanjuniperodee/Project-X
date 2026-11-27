import { HubPage } from '@/features/hub/hub-page';
import { api } from '@/shared/api/server';

// Prices come from the catalog at request time; nothing is fetched during the build.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const products = await api.products();
  return <HubPage products={products} />;
}
