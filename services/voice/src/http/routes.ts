import { StartVoiceSessionRequest } from '@px/contracts';
import { parseInput, type FastifyInstance } from '@px/service-kit';
import type { VoiceService } from '../application/voice-service';

export function registerRoutes(app: FastifyInstance, voice: VoiceService) {
  /** Starts a conversation: the answer tells the page which provider to use and carries its credential. */
  app.post('/voice/sessions', async (request, reply) => {
    const body = parseInput(StartVoiceSessionRequest, request.body);
    reply.header('cache-control', 'no-store');
    return voice.startSession(body);
  });
}
