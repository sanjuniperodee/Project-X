import { LayoutPage, z, type LayoutPreviewPagesRequest } from '@px/contracts';
import { ServiceClient } from '@px/service-kit';
import type { LayoutPreviewGateway } from '../application/preview-service';

const PreviewPages = z.object({ pages: z.array(LayoutPage), warnings: z.array(z.string()) });

export class HttpLayoutGateway implements LayoutPreviewGateway {
  private readonly client: ServiceClient;

  constructor(baseUrl: string) {
    // A 36-page magazine with photos renders in a few seconds; the cover portrait adds a couple more.
    this.client = new ServiceClient('layout', baseUrl, { timeoutMs: 90_000 });
  }

  previewPages(request: LayoutPreviewPagesRequest) {
    return this.client.request('/internal/preview-pages', PreviewPages, { method: 'POST', body: request });
  }
}
