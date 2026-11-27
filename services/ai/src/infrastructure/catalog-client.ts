import { Product, type ProductId } from '@px/contracts';
import { ServiceClient } from '@px/service-kit';

export class CatalogClient {
  private readonly client: ServiceClient;

  constructor(baseUrl: string) {
    this.client = new ServiceClient('catalog', baseUrl);
  }

  product(id: ProductId): Promise<Product> {
    return this.client.request(`/products/${id}`, Product);
  }
}
