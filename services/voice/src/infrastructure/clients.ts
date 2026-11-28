import { Product, ProjectView, type ProductId } from '@px/contracts';
import { ServiceClient } from '@px/service-kit';
import type { CatalogGateway, ProjectsGateway } from '../application/ports';

export class HttpProjectsGateway implements ProjectsGateway {
  private readonly client: ServiceClient;

  constructor(baseUrl: string) {
    this.client = new ServiceClient('projects', baseUrl);
  }

  project(editKey: string): Promise<ProjectView> {
    return this.client.request(`/projects/${encodeURIComponent(editKey)}`, ProjectView);
  }
}

export class HttpCatalogGateway implements CatalogGateway {
  private readonly client: ServiceClient;

  constructor(baseUrl: string) {
    this.client = new ServiceClient('catalog', baseUrl);
  }

  product(id: ProductId): Promise<Product> {
    return this.client.request(`/products/${id}`, Product);
  }
}
