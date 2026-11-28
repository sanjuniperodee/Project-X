import { CatalogPhotosRequest, ProductId, SellerTrialRequest, SetConversationModeRequest, StudioReplyRequest, z } from '@px/contracts';
import { AppError, parseInput, type FastifyInstance } from '@px/service-kit';
import type { CatalogService } from '../application/catalog-service';
import type { UsageStore } from '../infrastructure/usage-store';
import type { SalesService } from '../application/sales-service';
import { parseGowaWebhook, verifyGowaSignature } from '../infrastructure/gowa';

const IdParams = z.object({ id: z.uuid() });

export function registerRoutes(app: FastifyInstance, sales: SalesService, catalog: CatalogService, usage: UsageStore, options: { webhookSecret: string }) {
  // Studio back office (the gateway requires the admin token for /api/admin/*).
  app.get('/admin/whatsapp', async () => sales.whatsappStatus());
  app.post('/admin/whatsapp/qr', async () => sales.whatsappQr());
  app.post('/admin/whatsapp/logout', async () => sales.whatsappLogout());
  app.get('/admin/conversations', async () => ({ items: await sales.listConversations() }));
  app.get('/admin/conversations/:id', async (request) => sales.conversationView(parseInput(IdParams, request.params).id));
  app.post('/admin/conversations/:id/reply', async (request) =>
    sales.studioReply(parseInput(IdParams, request.params).id, parseInput(StudioReplyRequest, request.body).text),
  );
  app.post('/admin/conversations/:id/mode', async (request) =>
    sales.setMode(parseInput(IdParams, request.params).id, parseInput(SetConversationModeRequest, request.body).mode),
  );

  // WhatsApp Business catalog: photos per product and the sync of our formats into WhatsApp.
  app.get('/admin/catalog', async () => catalog.status());
  app.put('/admin/catalog/photos/:productId', async (request) => {
    const { productId } = parseInput(z.object({ productId: ProductId }), request.params);
    return catalog.setPhotos(productId, parseInput(CatalogPhotosRequest, request.body).images);
  });
  app.post('/admin/catalog/sync', async () => catalog.sync());

  app.get('/admin/usage', async (request) => {
    const { days } = parseInput(z.object({ days: z.coerce.number().int().min(1).max(366).default(30) }), request.query);
    return usage.summary(days);
  });

  app.post('/admin/sales/trial', async (request) => sales.trial(parseInput(SellerTrialRequest, request.body).messages));

  // GOWA webhook: signed raw body. Only the gateway on this host calls it (127.0.0.1), never the internet.
  app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
    scope.post('/webhooks/whatsapp', async (request, reply) => {
      const raw = request.body as Buffer;
      const signature = request.headers['x-hub-signature-256'];
      if (!verifyGowaSignature(raw, Array.isArray(signature) ? signature[0] : signature, options.webhookSecret)) {
        throw AppError.unauthorized('Неверная подпись');
      }
      let body: unknown;
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch {
        throw AppError.badRequest('Не JSON');
      }
      for (const message of parseGowaWebhook(body)) await sales.handleInbound(message);
      return reply.status(200).send({ ok: true });
    });
  });
}
