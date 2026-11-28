import { initialScriptState, scriptAnswer, scriptQuestion, type ScriptExpectation, type ScriptState } from '@px/contracts';
import type { StudioEvent, StudioStore, VoiceEvents, VoiceSession } from './types';

/** The parts of the Web Speech API used here (not in every TypeScript DOM library yet). */
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionClass = new () => Recognition;

const recognitionClass = (): RecognitionClass | undefined => {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

/**
 * The conversation without a provider: the scripted interviewer asks the questionnaire in order,
 * the browser's own speech synthesis speaks and its speech recognition listens (where there is
 * none, replies are typed). Used when no agent is configured or the live connection failed.
 */
export class BrowserSession implements VoiceSession {
  private state: ScriptState = initialScriptState();
  private expect: ScriptExpectation | 'changes' | null = null;
  private recognition: Recognition | undefined;
  private mic: { stream: MediaStream; context: AudioContext; analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> } | undefined;
  private phase: 'idle' | 'listening' | 'thinking' | 'speaking' = 'idle';
  private speakingSince = 0;
  private muted = false;
  private ended = false;
  private canHear: boolean;
  /** Recognition attempts in a row that ended in an error. */
  private failures = 0;
  /** Number of the line being spoken: a newer line (or a typed reply) makes older timers no-ops. */
  private line = 0;

  constructor(
    private readonly store: StudioStore,
    private readonly events: VoiceEvents,
  ) {
    this.canHear = recognitionClass() !== undefined;
  }

  get hears(): boolean {
    return this.canHear;
  }

  async start(): Promise<void> {
    this.events.onPhase('connecting');
    if (this.canHear) await this.openMicrophone();
    if (this.store.mode === 'edit') {
      this.expect = 'changes';
      this.say('Макет готов, он на экране. Скажите одной фразой, что поменять. Если всё нравится, нажмите «Согласовать».');
      return;
    }
    const turn = this.nextQuestion();
    const skip = this.canHear ? 'скажите «пропустить»' : 'напишите «пропустить»';
    this.say(`Здравствуйте! Пройдём по анкете. Не знаете ответа — ${skip}. ${turn}`);
  }

  async stop(): Promise<void> {
    this.ended = true;
    this.recognition?.abort();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.mic?.stream.getTracks().forEach((track) => track.stop());
    void this.mic?.context.close().catch(() => undefined);
    this.mic = undefined;
  }

  sendText(text: string): void {
    this.line++;
    this.recognition?.abort();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    void this.hear(text);
  }

  notify(event: StudioEvent): void {
    // Photos were the question: closing the drop zone moves on.
    if (event.kind === 'photos_closed' && this.expect && this.expect !== 'changes' && this.expect.kind === 'photos') {
      this.line++;
      this.recognition?.abort();
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
      void this.hear('дальше', false);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.recognition?.abort();
    else if (this.phase === 'listening') this.listen();
  }

  levels() {
    let input = 0;
    if (this.mic && this.phase === 'listening' && !this.muted) {
      this.mic.analyser.getByteTimeDomainData(this.mic.data);
      let sum = 0;
      for (const sample of this.mic.data) sum += ((sample - 128) / 128) ** 2;
      input = Math.min(1, Math.sqrt(sum / this.mic.data.length) * 4);
    }
    // Speech synthesis gives no audio to measure: a syllable-like pulse stands in for it.
    const t = (performance.now() - this.speakingSince) / 1000;
    const output = this.phase === 'speaking' ? 0.3 + 0.2 * Math.sin(t * 9) + 0.15 * Math.sin(t * 23.7) : 0;
    return { input, output: Math.max(0, output) };
  }

  /** Asks the next question; returns the line to say. */
  private nextQuestion(): string {
    const turn = scriptQuestion(this.store.product, this.store.project().answers, this.state);
    this.expect = turn.expect;
    if (turn.expect.kind === 'photos') this.store.requestPhotos(turn.expect.field.path);
    if (turn.expect.kind !== 'done') return turn.say;

    const finished = this.store.finish();
    if (finished.ok) {
      this.expect = null;
      return 'Это были все вопросы. Передаю материалы в редакцию.';
    }
    // Something required was skipped (a cover photo): ask for it again.
    this.state = { skipped: [] };
    return `${finished.message} ${this.nextQuestion()}`;
  }

  private async hear(text: string, echo = true): Promise<void> {
    if (this.ended || !this.expect) return;
    if (echo) this.events.onUser(text, true);
    this.setPhase('thinking');
    if (this.expect === 'changes') {
      const result = await this.store.requestChanges(text);
      if (result.ok) this.expect = null;
      this.say(result.ok ? 'Передала редакции. Новая версия появится через пару минут.' : result.message);
      return;
    }
    const expect = this.expect;
    let reply: ReturnType<typeof scriptAnswer>;
    try {
      reply = await this.store.exclusive(async () => {
        const result = scriptAnswer(this.store.product, this.store.project().answers, this.state, expect, text);
        for (const change of result.changes) await this.store.apply(change);
        return result;
      });
    } catch {
      this.say('Не получилось сохранить ответ: проверьте интернет и повторите.');
      return;
    }
    this.state = reply.state;
    const question = this.nextQuestion();
    // Still inside the same list: «Записала. Ещё?» is enough, the question is not repeated.
    const now = this.expect as BrowserSession['expect'];
    const sameList = expect.kind === 'list' && now !== null && now !== 'changes' && now.kind === 'list' && now.field.path === expect.field.path;
    this.say(sameList && reply.say ? reply.say : [reply.say, question].filter(Boolean).join(' '));
  }

  private say(text: string): void {
    if (this.ended) return;
    this.events.onAssistant(text);
    this.setPhase('speaking');
    this.speakingSince = performance.now();
    const line = ++this.line;
    const done = () => {
      if (this.ended || line !== this.line) return;
      this.line++;
      if (this.expect === null) {
        this.setPhase('idle');
        this.events.onEnd();
      } else this.listen();
    };
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
      setTimeout(done, Math.min(6000, 600 + text.length * 35));
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU';
    utterance.voice = speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith('ru')) ?? null;
    utterance.rate = 1.05;
    // Some browsers never fire `end` (no voices installed): a timer ends the line for them.
    const guard = setTimeout(done, 1500 + text.length * 90);
    const finish = () => {
      clearTimeout(guard);
      done();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  private listen(): void {
    this.setPhase('listening');
    const Recognizer = recognitionClass();
    if (!Recognizer || !this.canHear || this.muted) return;
    const recognition = new Recognizer();
    this.recognition = recognition;
    recognition.lang = 'ru-RU';
    recognition.interimResults = true;
    recognition.continuous = false;
    let heard = '';
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1]!;
      const text = result[0]!.transcript.trim();
      if (result.isFinal) heard = text;
      else this.events.onUser(text, false);
    };
    recognition.onerror = (event) => {
      // Silence is not a failure; a blocked microphone or an unreachable recognition service is.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      this.failures += event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 3 : 1;
      if (this.failures >= 3) this.goDeaf();
    };
    recognition.onend = () => {
      if (this.ended || this.recognition !== recognition || this.phase !== 'listening') return;
      if (heard) {
        this.failures = 0;
        void this.hear(heard);
      } else if (this.canHear && !this.muted) setTimeout(() => this.phase === 'listening' && this.recognition === recognition && this.listen(), 250);
    };
    try {
      recognition.start();
    } catch {
      this.goDeaf();
    }
  }

  private goDeaf(): void {
    if (!this.canHear) return;
    this.canHear = false;
    this.events.onDeaf?.();
  }

  private setPhase(phase: BrowserSession['phase']): void {
    this.phase = phase;
    this.events.onPhase(phase);
  }

  private async openMicrophone(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      this.mic = { stream, context, analyser, data: new Uint8Array(analyser.fftSize) };
    } catch {
      // No microphone: the conversation goes on in text.
      this.canHear = false;
    }
  }
}
