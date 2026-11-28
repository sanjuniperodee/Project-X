import { z } from 'zod';

/**
 * Voice studio: the questionnaire as a spoken conversation, and spoken change requests to a layout.
 *
 *   browser ──POST /api/voice/sessions──▶ voice service ──▶ ElevenLabs (conversation token)
 *      │◀── provider + token + context ──┘
 *      └── realtime audio with the ElevenLabs agent; the agent's tool calls run in the browser
 *          and save answers through the same projects API the forms use.
 *
 * Without an agent configured the service answers `provider: "browser"`: the page then runs the
 * scripted interviewer (interview-script.ts) on the browser's own speech recognition and synthesis.
 */
export const VoiceMode = z.enum([
  /** Filling the questionnaire. */
  'interview',
  /** Talking through changes to the layout waiting for approval. */
  'edit',
]);
export type VoiceMode = z.infer<typeof VoiceMode>;

export const StartVoiceSessionRequest = z.object({
  editKey: z.string().min(10).max(64),
  mode: VoiceMode,
});
export type StartVoiceSessionRequest = z.infer<typeof StartVoiceSessionRequest>;

export const VoiceSessionView = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('browser') }),
  z.object({
    provider: z.literal('elevenlabs'),
    /** WebRTC session token (preferred) or a signed WebSocket URL: exactly one is set. */
    conversationToken: z.string().optional(),
    signedUrl: z.string().optional(),
    /** Values for the `{{placeholders}}` of the agent's prompt and first message. */
    dynamicVariables: z.record(z.string(), z.string()),
  }),
]);
export type VoiceSessionView = z.infer<typeof VoiceSessionView>;

/**
 * Tools the assistant calls; they run in the browser (ElevenLabs "client tools").
 * The names and parameters here are the contract between the agent definition
 * (services/voice/src/agent) and the page that executes them.
 */
export const VOICE_TOOLS = {
  save_answer: z.object({ field: z.string(), value: z.string() }),
  append_answer: z.object({ field: z.string(), text: z.string() }),
  add_list_item: z.object({ list: z.string(), item: z.string() }),
  remove_list_item: z.object({ list: z.string(), index: z.coerce.number().int().positive().optional() }),
  request_photos: z.object({ field: z.string() }),
  get_status: z.object({}),
  finish_interview: z.object({}),
  show_page: z.object({ page: z.coerce.number().int().positive() }),
  request_changes: z.object({ comment: z.string() }),
} as const;
export type VoiceToolName = keyof typeof VOICE_TOOLS;
