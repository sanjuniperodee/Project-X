import {
  AdminProjectView,
  CheckoutResponse,
  CreateProjectResponse,
  Product,
  ProductSummary,
  ProjectView,
  z,
  type CreateProjectRequestInput,
  type PaymentKind,
  type ProductId,
} from '@px/contracts';
import { ServiceClient } from '@px/service-kit';
import type { CatalogGateway, ProjectsGateway } from '../application/ports';

export class HttpCatalogGateway implements CatalogGateway {
  private readonly client: ServiceClient;
  private cache: { at: number; products: Product[] } | null = null;

  constructor(baseUrl: string) {
    this.client = new ServiceClient('catalog', baseUrl);
  }

  async products(): Promise<Product[]> {
    if (this.cache && Date.now() - this.cache.at < 60_000) return this.cache.products;
    const { items } = await this.client.request('/products', z.object({ items: z.array(ProductSummary) }));
    const products = await Promise.all(items.map((p) => this.client.request(`/products/${p.id}`, Product)));
    this.cache = { at: Date.now(), products };
    return products;
  }

  async product(id: ProductId): Promise<Product> {
    const found = (await this.products()).find((p) => p.id === id);
    return found ?? this.client.request(`/products/${id}`, Product);
  }
}

/** The projects service on the private network (the same routes the gateway exposes, plus the studio read by id). */
export class HttpProjectsGateway implements ProjectsGateway {
  private readonly client: ServiceClient;

  constructor(baseUrl: string) {
    this.client = new ServiceClient('projects', baseUrl, { timeoutMs: 20_000 });
  }

  create(request: CreateProjectRequestInput) {
    return this.client.request('/projects', CreateProjectResponse, { method: 'POST', body: request });
  }

  get(editKey: string) {
    return this.client.request(`/projects/${encodeURIComponent(editKey)}`, ProjectView);
  }

  checkout(editKey: string, kind: PaymentKind) {
    return this.client.request(`/projects/${encodeURIComponent(editKey)}/checkout`, CheckoutResponse, { method: 'POST', body: { kind } });
  }

  byId(projectId: string) {
    return this.client.request(`/admin/projects/${encodeURIComponent(projectId)}`, AdminProjectView);
  }
}
