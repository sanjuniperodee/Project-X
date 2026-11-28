import { z } from '@px/contracts';
import { loadConfig } from '@px/service-kit';

export const config = loadConfig({
  PROJECTS_URL: z.url(),
  CATALOG_URL: z.url(),
  /**
   * `elevenlabs`: live conversation with the ElevenLabs agent (needs the key and the agent id,
   * see `npm run provision`). `browser`: no provider; pages use the scripted interviewer on the
   * browser's own speech recognition.
   */
  VOICE_PROVIDER: z.enum(['browser', 'elevenlabs']).default('browser'),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_AGENT_ID: z.string().optional(),
  ELEVENLABS_API_URL: z.url().default('https://api.elevenlabs.io'),
  /** `websocket` (signed URL; works behind strict networks) or `webrtc` (conversation token; lower latency). */
  VOICE_TRANSPORT: z.enum(['websocket', 'webrtc']).default('websocket'),
});

if (config.VOICE_PROVIDER === 'elevenlabs' && !(config.ELEVENLABS_API_KEY && config.ELEVENLABS_AGENT_ID)) {
  throw new Error('VOICE_PROVIDER=elevenlabs requires ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID');
}
