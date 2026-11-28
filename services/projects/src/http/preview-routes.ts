import { z } from '@px/contracts';
import { parseInput, type FastifyInstance } from '@px/service-kit';
import type { PreviewService } from '../application/preview-service';

const EditKeyParams = z.object({ editKey: z.string().min(10).max(64) });

export function registerPreviewRoutes(app: FastifyInstance, previews: PreviewService) {
  /** The issue built from the current answers, before the submit (POST: it renders, and may take a few seconds). */
  app.post('/projects/:editKey/preview', async (request, reply) => {
    const { editKey } = parseInput(EditKeyParams, request.params);
    reply.header('cache-control', 'no-store');
    return previews.preview(editKey);
  });
}
