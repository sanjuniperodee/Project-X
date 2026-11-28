import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { LayoutPreviewPagesRequest, LayoutPreviewRequest } from '@px/contracts';
import { parseInput, type FastifyInstance } from '@px/service-kit';
import type { LayoutService } from '../application/layout-service';
import type { CatalogGateway } from '../application/ports';
import { TEMPLATES } from '../templates';

/** Internal endpoints only (the gateway exposes nothing of this service). */
export function registerRoutes(app: FastifyInstance, layouts: LayoutService, catalog: CatalogGateway) {
  app.get('/internal/templates', async () => ({
    items: Object.entries(TEMPLATES).map(([productId, template]) => ({ productId, template: template.id })),
  }));

  /** Page previews of a project's current answers (projects calls it for the customer's preview before the submit). */
  app.post('/internal/preview-pages', async (request) => {
    const body = parseInput(LayoutPreviewPagesRequest, request.body);
    const product = await catalog.product(body.source.productId);
    return layouts.previewPages(product, body.source, { ...body.draft, generator: 'preview', generatedAt: new Date().toISOString() });
  });

  /** Renders a PDF from the given materials and streams it back; nothing is stored or published. */
  app.post('/internal/preview', async (request, reply) => {
    const body = parseInput(LayoutPreviewRequest, request.body);
    const product = await catalog.product(body.source.productId);
    const rendered = await layouts.render(
      product,
      { ...body.source, status: 'in_design', designMode: 'auto', nextVersion: 1 },
      { ...body.draft, generator: body.generator, generatedAt: new Date().toISOString() },
    );
    const stream = createReadStream(rendered.pdfFile);
    stream.on('close', () => void rm(rendered.workdir, { recursive: true, force: true }));
    return reply
      .header('content-type', 'application/pdf')
      .header('x-layout-pages', String(rendered.document.pages.length))
      .header('x-layout-warnings', encodeURIComponent(JSON.stringify(rendered.warnings)))
      .send(stream);
  });
}
