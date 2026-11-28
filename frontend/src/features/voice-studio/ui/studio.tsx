'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  display,
  formatTenge,
  interviewFields,
  interviewProgress,
  isAnswered,
  type Answers,
  type InterviewField,
  type MediaRef,
  type PaymentKind,
  type Product,
  type ProjectView,
  type VoiceMode,
  type VoiceSessionView,
} from '@px/contracts';
import { browserApi } from '@/shared/api/browser';
import { ApiError } from '@/shared/api/core';
import { cn } from '@/shared/lib/cn';
import { Orb } from '../orb/orb';
import { BrowserSession } from '../session/browser';
import { ElevenLabsSession } from '../session/elevenlabs';
import { StudioSounds } from '../session/sounds';
import { createToolHandlers } from '../session/tools';
import type { StudioStore, VoiceEvents, VoicePhase, VoiceSession } from '../session/types';
import { IssueViewer, toSpreads } from './issue-viewer';
import { Caption, Facts, Icon, PillButton, RoundButton, type Fact } from './parts';
import { PhotoPanel } from './photo-panel';

/**
 * intro → talk → (pay) → making → reveal ⇄ making (changes) → approved
 * `handoff`: a designer of the studio finishes the layout by hand.
 */
type Scene = 'intro' | 'talk' | 'pay' | 'making' | 'reveal' | 'handoff' | 'approved';

function sceneOf(project: ProjectView, returnedFrom: PaymentKind | null): Scene {
  switch (project.status) {
    case 'draft':
    case 'deposit_paid':
      // Back from the deposit payment: wait for its confirmation, then the issue is made at once.
      return returnedFrom === 'deposit' ? 'pay' : 'intro';
    case 'in_design':
      return project.design.mode === 'studio' ? 'handoff' : 'making';
    case 'awaiting_approval':
      return project.layout?.status === 'pending' ? 'reveal' : project.layout?.status === 'approved' ? 'approved' : 'handoff';
    default:
      return 'approved';
  }
}

/** The answers as they are right now, for brand widgets shown in the studio (the live cover). */
const AnswersContext = createContext<Answers>({});
export const useStudioAnswers = () => useContext(AnswersContext);

/** Set before leaving for the payment page, so the customer comes back to the studio, not the forms. */
export const voiceReturnKey = (editKey: string) => `px-voice-return:${editKey}`;

const MAKING_LINES = [
  'Редактор читает ваши ответы',
  'Пишем большое интервью',
  'Придумываем заголовки рубрик',
  'Подбираем кадры к страницам',
  'Верстаем развороты',
  'Собираем обложку',
  'Проверяем печатный файл',
];

export interface VoiceStudioProps {
  editKey: string;
  initialProject: ProjectView;
  product: Product;
  workspaceHref: string;
  /** Set when the customer came back from the payment page. */
  returnedFrom: PaymentKind | null;
  /** A brand widget fed by the live answers (Cover Me draws the cover as it fills in). */
  preview?: ReactNode;
}

export function VoiceStudio({ editKey, initialProject, product, workspaceHref, returnedFrom, preview }: VoiceStudioProps) {
  const [project, setProjectState] = useState(initialProject);
  const projectRef = useRef(initialProject);
  const setProject = useCallback((next: ProjectView) => {
    projectRef.current = next;
    setProjectState(next);
  }, []);

  const [scene, setScene] = useState<Scene>(() => sceneOf(initialProject, returnedFrom));
  const [mode, setMode] = useState<VoiceMode>('interview');
  const modeRef = useRef<VoiceMode>('interview');
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [assistant, setAssistant] = useState('');
  const [user, setUser] = useState<{ text: string; final: boolean } | null>(null);
  const [facts, setFacts] = useState<Fact[]>(() => knownFacts(product, initialProject.answers));
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typedOnly, setTypedOnly] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [photoTarget, setPhotoTarget] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [accent, setAccent] = useState('#e4007c');
  const [makingLine, setMakingLine] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<VoiceSession | null>(null);
  const [sounds] = useState(() => new StudioSounds());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const factId = useRef(1000);
  /** What happens once the assistant has said its last line. */
  const afterSpeech = useRef<'finish' | 'changes' | null>(null);

  const photoFields = useMemo(() => interviewFields(product).filter((f) => f.field.type === 'photos'), [product]);
  const progress = interviewProgress(product, project.answers);
  const talking = phase !== 'idle';

  const pushFact = useCallback((label: string, value: string) => {
    setFacts((current) => [{ id: factId.current++, label, value }, ...current].slice(0, 8));
  }, []);

  const submitNow = useCallback(async () => {
    setScene('making');
    try {
      setProject(await browserApi.submit(editKey));
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Не получилось отправить материалы. Проверьте интернет.');
      setScene('intro');
    }
  }, [editKey, setProject]);

  /** Runs once the assistant has finished its closing line. */
  const conclude = useCallback(async () => {
    const what = afterSpeech.current;
    if (!what) return;
    afterSpeech.current = null;
    await sessionRef.current?.stop();
    sessionRef.current = null;
    setPhase('idle');
    setPhotoTarget(null);
    const current = projectRef.current;
    if (what === 'changes') setScene(current.design.mode === 'studio' ? 'handoff' : 'making');
    else if (current.status === 'draft') setScene('pay');
    else await submitNow();
  }, [submitNow]);

  const store = useMemo<StudioStore>(
    () => ({
      product,
      get mode() {
        return modeRef.current;
      },
      project: () => projectRef.current,
      exclusive: (job) => {
        const run = queue.current.then(job, job);
        queue.current = run.catch(() => undefined);
        return run;
      },
      apply: async (change) => {
        setProject(await browserApi.saveStep(editKey, change.stepId, change.answers));
        pushFact(change.label, change.value);
        sounds.saved();
      },
      requestPhotos: (path) => {
        const field = interviewFields(product).find((f) => f.path === path && f.field.type === 'photos');
        if (!field) return { ok: false, message: `«${path}» — не поле с фотографиями.` };
        setPhotoProblem(null);
        setPhotoTarget(field.path);
        return { ok: true, message: `Окно для фото «${field.field.label}» открыто на экране. Продолжайте разговор, о добавленных фото сообщат.` };
      },
      finish: () => {
        const { missing } = interviewProgress(product, projectRef.current.answers);
        if (missing.length > 0) {
          return { ok: false, message: `Пока не хватает: ${missing.map((f) => `«${f.field.label}» (${f.path})`).join(', ')}.` };
        }
        afterSpeech.current = 'finish';
        // Whatever the assistant does next, the studio moves on.
        setTimeout(() => void conclude(), 9000);
        return { ok: true, message: 'Интервью завершено. Попрощайтесь одной короткой фразой и больше ничего не спрашивайте.' };
      },
      showPage: (number) => {
        const pages = projectRef.current.layout?.pages ?? [];
        const index = toSpreads(pages).findIndex((spread) => spread.some((p) => p.number === number));
        if (index < 0) return { ok: false, message: `В макете нет страницы ${number}: всего ${pages.length}.` };
        setPage(index);
        return { ok: true, message: `На экране страница ${number}.` };
      },
      requestChanges: async (comment) => {
        const layout = projectRef.current.layout;
        if (!layout) return { ok: false, message: 'Макета пока нет.' };
        try {
          setProject(await browserApi.requestLayoutChanges(editKey, { version: layout.version, comment }));
        } catch (error) {
          return { ok: false, message: error instanceof ApiError ? error.message : 'Не получилось отправить правки: нет связи.' };
        }
        afterSpeech.current = 'changes';
        setTimeout(() => void conclude(), 9000);
        return { ok: true, message: 'Правки переданы в редакцию. Скажите, что новая версия появится через пару минут, и попрощайтесь.' };
      },
    }),
    [product, editKey, setProject, pushFact, sounds, conclude],
  );

  const startConversation = useCallback(
    async (next: VoiceMode) => {
      sounds.unlock();
      sounds.start();
      setNotice(null);
      setAssistant('');
      setUser(null);
      modeRef.current = next;
      setMode(next);
      if (next === 'interview') setScene('talk');
      setPhase('connecting');

      const events: VoiceEvents = {
        onPhase: (value) => {
          setPhase(value);
          if (afterSpeech.current && (value === 'listening' || value === 'idle')) void conclude();
        },
        onAssistant: (text) => {
          setAssistant(text);
          setUser(null);
        },
        onUser: (text, final) => setUser({ text, final }),
        onDeaf: () => {
          setTypedOnly(true);
          setTyping(true);
        },
        onEnd: (error) => {
          sessionRef.current = null;
          setPhase('idle');
          if (afterSpeech.current) void conclude();
          else if (error) setNotice('Связь прервалась. Ответы сохранены, можно продолжить с того же места.');
        },
      };

      let view: VoiceSessionView = { provider: 'browser' };
      try {
        view = await browserApi.voiceSession(editKey, next);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          setNotice(error.message);
          setPhase('idle');
          return;
        }
        // The voice service is down: the scripted interviewer still works.
      }

      const browserSession = () => new BrowserSession(store, events);
      let session: VoiceSession;
      if (view.provider === 'elevenlabs') {
        session = new ElevenLabsSession(view, createToolHandlers(store), events);
        try {
          await session.start();
        } catch {
          await session.stop();
          setNotice('Живой голос сейчас недоступен, поэтому вопросы идут по порядку анкеты.');
          session = browserSession();
          await session.start();
        }
      } else {
        session = browserSession();
        await session.start();
      }
      sessionRef.current = session;
      setMuted(false);
      setTypedOnly(!session.hears);
      if (!session.hears) setTyping(true);
    },
    [editKey, store, sounds, conclude],
  );

  const stopConversation = useCallback(async () => {
    afterSpeech.current = null;
    await sessionRef.current?.stop();
    sessionRef.current = null;
    setPhase('idle');
    setPhotoTarget(null);
  }, []);

  // The accent of the brand colours the orb; leaving the page ends the conversation.
  useEffect(() => {
    const value = getComputedStyle(rootRef.current!).getPropertyValue('--c-accent').trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) queueMicrotask(() => setAccent(value));
    return () => {
      void sessionRef.current?.stop();
      sounds.dispose();
    };
  }, [sounds]);

  // While the issue is being made (or a payment is being confirmed), watch the project.
  const awaitingDeposit = scene === 'pay' && returnedFrom === 'deposit';
  useEffect(() => {
    if (scene !== 'making' && !awaitingDeposit) return;
    let alive = true;
    const lines = setInterval(() => setMakingLine((i) => i + 1), 3200);
    const poll = setInterval(async () => {
      const fresh = await browserApi.project(editKey).catch(() => null);
      if (!alive || !fresh) return;
      setProject(fresh);
      if (awaitingDeposit) {
        if (fresh.status !== 'deposit_paid') return;
        // Paid. Everything required is there (the usual case): make the issue; otherwise back to the conversation.
        if (interviewProgress(product, fresh.answers).missing.length === 0) void submitNow();
        else setScene('intro');
        return;
      }
      if (fresh.status === 'awaiting_approval' && fresh.layout?.status === 'pending') {
        sounds.ready();
        setPage(0);
        setScene('reveal');
      } else if (fresh.design.mode === 'studio') setScene('handoff');
    }, 2500);
    return () => {
      alive = false;
      clearInterval(lines);
      clearInterval(poll);
    };
  }, [scene, awaitingDeposit, editKey, product, setProject, submitNow, sounds]);

  // ---------- Photos ----------

  const defaultPhotoField = (): InterviewField | undefined => {
    const answers = projectRef.current.answers;
    const empty = (f: InterviewField) => !isAnswered(f.field, answers[f.step.id]?.[f.field.id]);
    return photoFields.find((f) => f.field.required && empty(f)) ?? [...photoFields].sort((a, b) => maxOf(b) - maxOf(a))[0];
  };

  async function addPhotos(files: File[]) {
    const target = photoFields.find((f) => f.path === photoTarget) ?? defaultPhotoField();
    const images = files.filter((file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name));
    if (!target || images.length === 0) return;
    setPhotoTarget(target.path);
    setPhotoProblem(null);
    setUploading((n) => n + images.length);
    const uploaded: MediaRef[] = [];
    for (const file of images) {
      try {
        const saved = await browserApi.upload(file);
        uploaded.push({ id: saved.id, url: saved.url });
      } catch (error) {
        setPhotoProblem(`${file.name}: ${error instanceof ApiError ? error.message : 'не загрузилось'}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (uploaded.length === 0) return;
    await store
      .exclusive(async () => {
        const step = projectRef.current.answers[target.step.id] ?? {};
        const current = Array.isArray(step[target.field.id]) ? (step[target.field.id] as MediaRef[]) : [];
        const next = [...current, ...uploaded].slice(0, maxOf(target));
        if (current.length + uploaded.length > next.length) setPhotoProblem(`В «${target.field.label}» помещается ${maxOf(target)} фото: лишние не добавлены.`);
        setProject(await browserApi.saveStep(editKey, target.step.id, { ...step, [target.field.id]: next }));
        pushFact(target.field.label, `${next.length} фото`);
        sounds.saved();
        sessionRef.current?.notify({ kind: 'photos', field: target.path, label: target.field.label, added: next.length - current.length, total: next.length });
      })
      .catch(() => setPhotoProblem('Фото загрузились, но не сохранились: проверьте интернет и добавьте ещё раз.'));
  }

  function closePhotos() {
    setPhotoTarget(null);
    sessionRef.current?.notify({ kind: 'photos_closed' });
  }

  const acceptsDrop = scene === 'intro' || scene === 'talk';
  const dragProps = acceptsDrop
    ? {
        onDragOver: (event: DragEvent) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: (event: DragEvent) => {
          if (event.currentTarget === event.target) setDragging(false);
        },
        onDrop: (event: DragEvent) => {
          event.preventDefault();
          setDragging(false);
          void addPhotos([...event.dataTransfer.files]);
        },
      }
    : {};

  // ---------- Actions ----------

  function sendTyped() {
    const text = draftText.trim();
    if (!text) return;
    setDraftText('');
    if (sessionRef.current) sessionRef.current.sendText(text);
    else if (scene === 'reveal') void sendChanges(text);
  }

  async function sendChanges(comment: string) {
    setBusy(true);
    const result = await store.requestChanges(comment);
    setBusy(false);
    if (result.ok) void conclude();
    else setNotice(result.message);
  }

  async function pay(kind: PaymentKind) {
    setBusy(true);
    setNotice(null);
    try {
      const { redirectUrl } = await browserApi.checkout(editKey, kind);
      if (kind === 'deposit') sessionStorage.setItem(voiceReturnKey(editKey), '1');
      window.location.assign(redirectUrl);
    } catch (error) {
      setBusy(false);
      setNotice(error instanceof ApiError ? error.message : 'Не получилось открыть оплату. Попробуйте ещё раз.');
    }
  }

  async function approve() {
    const layout = project.layout;
    if (!layout) return;
    setBusy(true);
    await stopConversation();
    try {
      setProject(await browserApi.approveLayout(editKey, layout.version));
      sounds.ready();
      setScene('approved');
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : 'Не получилось согласовать. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  const levels = useCallback(() => sessionRef.current?.levels() ?? { input: 0, output: 0 }, []);
  const target = photoFields.find((f) => f.path === photoTarget);
  const targetPhotos = target ? ((project.answers[target.step.id]?.[target.field.id] as MediaRef[] | undefined) ?? []) : [];
  const orbPhase: VoicePhase = scene === 'making' || awaitingDeposit ? 'thinking' : phase;
  const small = scene === 'reveal';
  const balance = project.quote.total - project.paidAmount;

  return (
    <div
      ref={rootRef}
      data-area="voice"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg font-body text-ink"
      style={{ backgroundImage: 'radial-gradient(70% 55% at 50% 40%, rgb(94 58 255 / 0.2), transparent 70%), radial-gradient(40% 30% at 50% 44%, color-mix(in srgb, var(--c-accent) 22%, transparent), transparent 75%)' }}
      {...dragProps}
    >
      <header className="relative z-10 flex items-center justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-7">
        <p className="min-w-0 truncate">
          <span className="font-display text-xl font-black">{product.name}</span>
          <span className="ml-3 text-sm text-muted">{project.subject}</span>
        </p>
        <Link href={workspaceHref} className="shrink-0 rounded-full border border-line px-4 py-2 text-sm backdrop-blur-md transition-colors hover:bg-white/15">
          {scene === 'intro' || scene === 'talk' ? 'Заполнить анкету самому' : 'К заказу'}
        </Link>
      </header>

      {/* The orb: the whole stage while we talk, a small presence next to the finished issue. */}
      <Orb
        phase={orbPhase}
        levels={levels}
        accent={accent}
        className={cn(
          'absolute transition-all duration-1000 ease-[cubic-bezier(0.2,0.7,0.2,1)]',
          small
            ? cn('top-12 right-1 size-24 sm:top-auto sm:right-auto sm:bottom-1 sm:left-5 sm:size-28', !talking && 'opacity-70')
            : 'top-[38%] left-1/2 size-[min(74vh,118vw)] -translate-x-1/2 -translate-y-1/2',
        )}
      />

      <AnswersContext.Provider value={project.answers}>
        {(scene === 'talk' || scene === 'intro') && (
          <>
            <div className="absolute top-24 left-8 z-10 w-60 max-lg:hidden">
              <Facts facts={facts} answered={progress.answered} total={progress.total} />
            </div>
            {preview && <div className="absolute top-24 right-8 z-10 w-44 max-lg:hidden xl:w-52">{preview}</div>}
          </>
        )}
      </AnswersContext.Provider>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {scene === 'intro' && (
          <div className="mt-auto flex flex-col items-center gap-6 px-5 pb-10 text-center sm:pb-14">
            <h1 className="max-w-3xl font-display text-[clamp(2rem,5vw,3.75rem)] leading-[1.02] font-black text-balance">
              {progress.answered > 0 ? 'Продолжим разговор' : 'Расскажите вслух, остальное сделаем мы'}
            </h1>
            <p className="max-w-xl leading-relaxed text-pretty text-muted">
              Я задаю вопросы, вы отвечаете голосом. Фотографии можно перетащить на экран в любой момент. Обычно хватает десяти минут, а макет приходит через
              пару минут после разговора.
            </p>
            {notice && <Notice>{notice}</Notice>}
            <div className="flex flex-wrap justify-center gap-3">
              <PillButton tone="solid" onClick={() => void startConversation('interview')}>
                {Icon.mic}
                {progress.answered > 0 ? 'Продолжить разговор' : 'Начать разговор'}
              </PillButton>
              {progress.missing.length === 0 && (
                <PillButton onClick={() => (project.status === 'draft' ? setScene('pay') : void submitNow())}>Собрать номер</PillButton>
              )}
            </div>
            <p className="text-sm text-muted lg:hidden">
              Записано {progress.answered} из {progress.total}
            </p>
          </div>
        )}

        {scene === 'talk' && (
          <div className="mt-auto flex flex-col items-center gap-5 pb-5 sm:pb-7">
            {facts[0] && (
              <p key={facts[0].id} className="voice-fact max-w-[90vw] truncate rounded-full border border-line bg-surface px-4 py-1.5 text-sm backdrop-blur-md lg:hidden">
                <span className="text-muted">{facts[0].label}: </span>
                {facts[0].value}
              </p>
            )}
            {/* The photo panel takes the caption's place while it is open. */}
            <div className={cn('w-full', photoTarget && 'invisible')}>
              <Caption phase={phase} assistant={assistant} user={user} typedOnly={typedOnly} />
            </div>
            {notice && <Notice>{notice}</Notice>}

            {talking ? (
              <div className="flex w-full flex-col items-center gap-3 px-4">
                {typing && (
                  <form
                    className="flex w-full max-w-xl gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      sendTyped();
                    }}
                  >
                    <input
                      value={draftText}
                      onChange={(event) => setDraftText(event.target.value)}
                      placeholder="Ответьте текстом"
                      aria-label="Ответ текстом"
                      autoFocus
                      className="h-13 min-w-0 flex-1 rounded-full border border-line bg-field px-5 text-[15px] outline-none placeholder:text-muted focus-visible:border-white"
                    />
                    <PillButton tone="solid" onClick={sendTyped} className="px-6">
                      Ответить
                    </PillButton>
                  </form>
                )}
                <div className="flex items-center gap-3">
                  {!typedOnly && (
                    <RoundButton
                      label={muted ? 'Включить микрофон' : 'Выключить микрофон'}
                      active={muted}
                      onClick={() => {
                        sessionRef.current?.setMuted(!muted);
                        setMuted(!muted);
                      }}
                    >
                      {muted ? Icon.micOff : Icon.mic}
                    </RoundButton>
                  )}
                  {!typedOnly && (
                    <RoundButton label="Ответить текстом" active={typing} onClick={() => setTyping(!typing)}>
                      {Icon.keyboard}
                    </RoundButton>
                  )}
                  {photoFields.length > 0 && (
                    <RoundButton label="Добавить фотографии" active={photoTarget !== null} onClick={() => (photoTarget ? closePhotos() : setPhotoTarget(defaultPhotoField()?.path ?? null))}>
                      {Icon.photo}
                    </RoundButton>
                  )}
                  <PillButton onClick={() => void stopConversation()} className="px-5">
                    Пауза
                  </PillButton>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-3 px-4">
                <PillButton tone="solid" onClick={() => void startConversation('interview')}>
                  {Icon.mic}
                  Продолжить разговор
                </PillButton>
                {progress.missing.length === 0 && (
                  <PillButton onClick={() => (project.status === 'draft' ? setScene('pay') : void submitNow())}>Собрать номер</PillButton>
                )}
              </div>
            )}
          </div>
        )}

        {scene === 'pay' && (
          <Closing
            title={awaitingDeposit ? 'Проверяем оплату' : 'Интервью у меня. Осталась предоплата'}
            text={
              awaitingDeposit
                ? 'Как только платёж подтвердится, редакция сразу начнёт собирать номер. Обычно это несколько секунд.'
                : `Предоплата ${formatTenge(project.quote.deposit)} запускает редакцию: через пару минут после неё вы увидите готовый макет. Остальное платите, только когда макет понравится.`
            }
          >
            {notice && <Notice>{notice}</Notice>}
            {!awaitingDeposit && (
              <PillButton tone="solid" disabled={busy} onClick={() => void pay('deposit')}>
                Внести предоплату {formatTenge(project.quote.deposit)}
              </PillButton>
            )}
          </Closing>
        )}

        {scene === 'making' && (
          <Closing title="Собираем ваш номер" text="Тексты, рубрики, обложка, печатный файл. Обычно это одна-две минуты. Страницу можно не закрывать: макет появится здесь же.">
            <p key={makingLine} className="voice-word text-[15px] text-ink/90" aria-live="polite">
              {MAKING_LINES[makingLine % MAKING_LINES.length]}…
            </p>
          </Closing>
        )}

        {scene === 'handoff' && (
          <Closing
            title="Номер дособерёт дизайнер"
            text="Этот макет мы доводим вручную. Когда он будет готов, напишем вам в WhatsApp, а посмотреть и согласовать его можно будет на странице заказа."
          >
            <Link href={workspaceHref} className="inline-flex h-13 items-center rounded-full bg-white px-7 text-[15px] font-semibold text-black hover:bg-accent hover:text-accent-ink">
              Открыть заказ
            </Link>
          </Closing>
        )}

        {scene === 'approved' && (
          <Closing
            title={balance > 0 && project.status === 'awaiting_approval' ? 'Макет согласован' : 'Номер уходит в печать'}
            text={
              balance > 0 && project.status === 'awaiting_approval'
                ? `Осталось оплатить ${formatTenge(balance)}, и мы отправляем номер в типографию.`
                : 'Всё оплачено. О печати и доставке напишем в WhatsApp, а статус всегда виден на странице заказа.'
            }
          >
            {notice && <Notice>{notice}</Notice>}
            <div className="flex flex-wrap justify-center gap-3">
              {balance > 0 && project.status === 'awaiting_approval' && (
                <PillButton tone="solid" disabled={busy} onClick={() => void pay('balance')}>
                  Оплатить {formatTenge(balance)}
                </PillButton>
              )}
              <Link href={workspaceHref} className="inline-flex h-13 items-center rounded-full border border-line bg-surface px-7 text-[15px] font-semibold backdrop-blur-md hover:bg-white/15">
                Открыть заказ
              </Link>
            </div>
          </Closing>
        )}

        {scene === 'reveal' && project.layout && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pt-3 pb-4 sm:px-8 sm:pb-6">
            <IssueViewer pages={project.layout.pages} index={page} onIndex={setPage} />
            <div className="flex flex-col items-center gap-3">
              {talking && mode === 'edit' && (
                <p key={assistant} data-voice-line className="voice-word max-w-2xl text-center font-display text-xl leading-snug text-balance italic" aria-live="polite">
                  {assistant || 'Соединяю…'}
                </p>
              )}
              {talking && user && <p className="max-w-xl text-center text-sm text-muted">{user.text}</p>}
              {notice && <Notice>{notice}</Notice>}
              {(typing || typedOnly) && (
                <form
                  className="flex w-full max-w-xl gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    sendTyped();
                  }}
                >
                  <input
                    value={draftText}
                    onChange={(event) => setDraftText(event.target.value)}
                    placeholder="Что поменять: страница, текст или фото"
                    aria-label="Правки текстом"
                    className="h-13 min-w-0 flex-1 rounded-full border border-line bg-field px-5 text-[15px] outline-none placeholder:text-muted focus-visible:border-white"
                  />
                  <PillButton tone="solid" disabled={busy} onClick={sendTyped} className="px-6">
                    Отправить
                  </PillButton>
                </form>
              )}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <PillButton tone="solid" disabled={busy} onClick={() => void approve()}>
                  Согласовать макет
                </PillButton>
                {talking ? (
                  <PillButton onClick={() => void stopConversation()}>Закончить разговор</PillButton>
                ) : (
                  <PillButton disabled={busy} onClick={() => void startConversation('edit')}>
                    {Icon.mic}
                    Сказать, что поменять
                  </PillButton>
                )}
                <RoundButton label="Написать правки текстом" active={typing} onClick={() => setTyping(!typing)}>
                  {Icon.keyboard}
                </RoundButton>
              </div>
            </div>
          </div>
        )}
      </div>

      {target && target.field.type === 'photos' && (scene === 'talk' || scene === 'intro') && (
        <PhotoPanel
          label={target.field.label}
          hint={target.field.hint}
          photos={targetPhotos}
          max={target.field.max}
          uploading={uploading}
          problem={photoProblem}
          onFiles={(files) => void addPhotos(files)}
          onClose={closePhotos}
        />
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-[28px] border-2 border-dashed border-white/70 bg-[#120a22]/70 backdrop-blur-sm">
          <p className="font-display text-4xl italic">Отпустите фото</p>
        </div>
      )}
    </div>
  );
}

/** Centred text under the orb for the quiet scenes (payment, making, the end). */
function Closing({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="mt-auto flex flex-col items-center gap-5 px-5 pb-12 text-center sm:pb-16">
      <h1 className="max-w-3xl font-display text-[clamp(1.9rem,4.4vw,3.25rem)] leading-[1.05] font-black text-balance">{title}</h1>
      <p className="max-w-xl leading-relaxed text-pretty text-muted">{text}</p>
      {children}
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="max-w-xl rounded-[14px] border border-line bg-surface px-4 py-2.5 text-center text-sm leading-snug backdrop-blur-md">
      {children}
    </p>
  );
}

const maxOf = (field: InterviewField) => (field.field.type === 'photos' ? field.field.max : 0);

/** The latest answers already in the project, so a resumed conversation does not start with an empty rail. */
function knownFacts(product: Product, answers: Answers): Fact[] {
  const facts: Fact[] = [];
  for (const { step, field } of interviewFields(product)) {
    const value = answers[step.id]?.[field.id];
    if (!isAnswered(field, value)) continue;
    const text = field.type === 'list' ? `${(value as unknown[]).length} записей` : display(field, value);
    facts.unshift({ id: facts.length, label: field.label, value: text });
  }
  return facts.slice(0, 6);
}
