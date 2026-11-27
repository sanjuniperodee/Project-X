import { calculateQuote, ProductId, QuoteError, QuoteSelection, toProductSummary, z } from '@px/contracts';
import { AppError, parseInput, type FastifyInstance } from '@px/service-kit';
import type { ProductRegistry } from '../products';

const Params = z.object({ productId: z.string() });

export function registerRoutes(app: FastifyInstance, registry: ProductRegistry) {
  const find = (params: unknown) => {
    const { productId } = parseInput(Params, params);
    const id = ProductId.safeParse(productId);
    const product = id.success ? registry.get(id.data) : undefined;
    if (!product) throw AppError.notFound('Продукт');
    return product;
  };

  app.get('/products', async (_request, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return { items: registry.list().map(toProductSummary) };
  });

  app.get('/products/:productId', async (request, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return find(request.params);
  });

  app.post('/products/:productId/quote', async (request) => {
    const product = find(request.params);
    const selection = parseInput(QuoteSelection, request.body);
    try {
      return calculateQuote(product, selection);
    } catch (error) {
      if (error instanceof QuoteError) throw AppError.badRequest(error.message);
      throw error;
    }
  });
}
