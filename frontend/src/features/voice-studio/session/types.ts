import type { Product, ProjectView, StepChange, VoiceMode } from '@px/contracts';

export type VoicePhase =
  /** Before the conversation and after it. */
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking';

/** What a conversation reports to the screen. */
export interface VoiceEvents {
  onPhase(phase: VoicePhase): void;
  /** A complete line said by the assistant. */
  onAssistant(text: string): void;
  /** What the person said (`final: false` while they are still speaking). */
  onUser(text: string, final: boolean): void;
  /** Speech recognition stopped working mid-conversation: replies are typed from now on. */
  onDeaf?(): void;
  /** The conversation ended: by the assistant, the provider or an error (message for the person). */
  onEnd(error?: string): void;
}

/** One live conversation, whatever runs it. */
export interface VoiceSession {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** A typed reply instead of a spoken one. */
  sendText(text: string): void;
  /** Tells the assistant about something that happened on the screen (photos added…). */
  notify(event: StudioEvent): void;
  setMuted(muted: boolean): void;
  /** Loudness of the microphone and of the assistant, 0…1. */
  levels(): { input: number; output: number };
  /** False when replies can only be typed (no speech recognition in this browser). */
  readonly hears: boolean;
}

export type StudioEvent = { kind: 'photos'; field: string; label: string; added: number; total: number } | { kind: 'photos_closed' };

/**
 * What the assistant can do to the order: the screen implements it, both kinds of session
 * drive it (the agent through tool calls, the scripted interviewer directly).
 */
export interface StudioStore {
  readonly product: Product;
  readonly mode: VoiceMode;
  project(): ProjectView;
  /** Runs jobs that read answers and then save them one at a time, so saves never overwrite each other. */
  exclusive<T>(job: () => Promise<T>): Promise<T>;
  /** Saves one step and shows the new fact on the screen. */
  apply(change: StepChange): Promise<void>;
  /** Opens the photo drop zone for a photos field. */
  requestPhotos(path: string): { ok: boolean; message: string };
  /** Ends the interview when everything required is there. */
  finish(): { ok: boolean; message: string };
  showPage(page: number): { ok: boolean; message: string };
  requestChanges(comment: string): Promise<{ ok: boolean; message: string }>;
}
