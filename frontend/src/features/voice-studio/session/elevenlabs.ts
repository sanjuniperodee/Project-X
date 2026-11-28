import type { VoiceSessionView } from '@px/contracts';
import type { Conversation } from '@elevenlabs/client';
import type { ToolHandlers } from './tools';
import type { StudioEvent, VoiceEvents, VoiceSession } from './types';

type RealtimeView = Extract<VoiceSessionView, { provider: 'elevenlabs' }>;

/**
 * A live conversation with the ElevenLabs agent: it hears, thinks and speaks on their side,
 * and calls our tools here. The SDK (with its WebRTC client) is loaded only when a conversation starts.
 */
export class ElevenLabsSession implements VoiceSession {
  readonly hears = true;
  private conversation: Conversation | undefined;
  private ended = false;

  constructor(
    private readonly view: RealtimeView,
    private readonly tools: ToolHandlers,
    private readonly events: VoiceEvents,
  ) {}

  async start(): Promise<void> {
    this.events.onPhase('connecting');
    const { Conversation } = await import('@elevenlabs/client');
    const { conversationToken, signedUrl, dynamicVariables } = this.view;
    this.conversation = await Conversation.startSession({
      ...(conversationToken ? { conversationToken, connectionType: 'webrtc' as const } : { signedUrl: signedUrl!, connectionType: 'websocket' as const }),
      dynamicVariables,
      clientTools: this.tools,
      useWakeLock: true,
      onModeChange: ({ mode }) => this.events.onPhase(mode === 'speaking' ? 'speaking' : 'listening'),
      onMessage: ({ message, role }) => {
        if (role === 'user') {
          this.events.onUser(message, true);
          // The agent is composing its reply until it starts to speak.
          this.events.onPhase('thinking');
        } else this.events.onAssistant(message);
      },
      onError: (message) => this.end(typeof message === 'string' ? message : 'Связь прервалась'),
      onDisconnect: (details) => this.end(details.reason === 'error' ? 'Связь прервалась' : undefined),
    });
  }

  async stop(): Promise<void> {
    this.ended = true;
    await this.conversation?.endSession().catch(() => undefined);
  }

  sendText(text: string): void {
    this.events.onUser(text, true);
    this.events.onPhase('thinking');
    this.conversation?.sendUserMessage(text);
  }

  notify(event: StudioEvent): void {
    if (event.kind !== 'photos') return;
    this.conversation?.sendContextualUpdate(`Человек добавил фото в «${event.label}» (${event.field}): ${event.added} шт., всего там ${event.total}.`);
  }

  setMuted(muted: boolean): void {
    this.conversation?.setMicMuted(muted);
  }

  levels() {
    const c = this.conversation;
    return c?.isOpen() ? { input: c.getInputVolume(), output: c.getOutputVolume() } : { input: 0, output: 0 };
  }

  private end(error?: string) {
    if (this.ended) return;
    this.ended = true;
    this.events.onEnd(error);
  }
}
