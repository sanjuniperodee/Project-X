import { Product, type ProductId } from '@px/contracts';
import { ServiceClient } from '@px/service-kit';
import type { CatalogGateway } from '../application/ports';

/** Catalog over HTTP with a short in-memory cache: product definitions change rarely. */
export class HttpCatalogGateway implements CatalogGateway {
  private readonly client: ServiceClient;
  private readonly cache = new Map<ProductId, { product: Product; expiresAt: number }>();

  constructor(baseUrl: string, private readonly ttlMs = 60_000) {
    this.client = new ServiceClient('catalog', baseUrl);
  }

  async product(id: ProductId): Promise<Product> {
    const cached = this.cache.get(id);
    if (cached && cached.expiresAt > Date.now()) return cached.product;

    const product = await this.client.request(`/products/${id}`, Product);
    this.cache.set(id, { product, expiresAt: Date.now() + this.ttlMs });
    return product;
  }
}
