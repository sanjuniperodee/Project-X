import { CreatePaymentRequest, KaspiCodeRequest, KaspiVerifyRequest, z } from '@px/contracts';
import { parseInput, type FastifyInstance } from '@px/service-kit';
import type { CashierService } from '../application/cashier-service';
import type { PaymentService } from '../application/payment-service';

const IdParams = z.object({ id: z.uuid() });
const ProviderParams = z.object({ provider: z.string().min(1).max(32) });
const ConfirmBody = z.object({ outcome: z.enum(['success', 'fail']) });

export function registerRoutes(app: FastifyInstance, payments: PaymentService, cashier: CashierService) {
  // Internal API — the gateway never routes /internal/*.
  app.post('/internal/payments', async (request, reply) => {
    const body = parseInput(CreatePaymentRequest, request.body);
    return reply.status(201).send(await payments.create(body));
  });

  app.get('/payments/:id', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    return payments.get(id);
  });

  app.post('/payments/:id/mock/confirm', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const { outcome } = parseInput(ConfirmBody, request.body);
    return payments.confirmManually(id, outcome);
  });

  // Studio back office (the gateway requires the admin token for /api/admin/*).
  app.get('/admin/payments/kaspi', async () => cashier.status());
  app.post('/admin/payments/kaspi/code', async (request) => {
    const { phone } = parseInput(KaspiCodeRequest, request.body);
    return cashier.requestCode(phone);
  });
  app.post('/admin/payments/kaspi/verify', async (request) => {
    const { processId, otp } = parseInput(KaspiVerifyRequest, request.body);
    return cashier.verify(processId, otp);
  });
  app.post('/admin/payments/kaspi/disconnect', async () => cashier.disconnect());

  // Webhooks need the untouched body to verify provider signatures.
  app.register(async (scope) => {
    // Drop the built-in JSON parser too: providers send application/json, and the signature covers the exact bytes.
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
    scope.post('/webhooks/:provider', async (request, reply) => {
      const { provider } = parseInput(ProviderParams, request.params);
      const result = await payments.handleWebhook(provider, { headers: request.headers, rawBody: request.body as Buffer });
      return reply.status(200).send({ ok: true, ignored: result.ignored });
    });
  });
}
