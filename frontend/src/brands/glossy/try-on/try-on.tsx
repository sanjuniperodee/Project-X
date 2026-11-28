'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import { saveHandoff } from '@/shared/lib/handoff';
import { GLOSSY_STYLES, type GlossyStyleId } from '../styles';
import { canvasBlob, drawStory } from './story';
import { COVER_SIZE, drawCover, type CoverContent, type CoverFonts, type CoverPhoto } from './draw-cover';
import { loadCoverFonts } from './fonts';
import { pickPhoto } from './photo';
import { SAMPLE_PORTRAIT } from './sample-portrait';
import { PortraitTracer } from './tracer';

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const LINES = [
  { title: 'Большое интервью', text: 'Впервые откровенно о главном' },
  { title: 'Друзья рассказали всё', text: 'Истории, которые герой просил не печатать' },
  { title: 'Правила жизни', text: 'Принципы, которые работают' },
  { title: 'В цифрах', text: 'Целая жизнь, посчитанная до чашки кофе' },
];
const TAGLINE = 'Специальный выпуск о человеке, которого мы любим';

type Status =
  | { kind: 'sample' }
  | { kind: 'working'; step: 'open' | 'model' | 'trace'; share?: number }
  /** found: the person was cut out; none: no clear person on the photo; failed: the model did not run. */
  | { kind: 'mine'; person: 'found' | 'none' | 'failed' }
  | { kind: 'error'; message: string };

/**
 * The landing's memorable moment: the printed cover, set in the browser like the layout service
 * sets it, in any of the four styles, around the visitor's name and, if they like, their own photo
 * with the head in front of the masthead. The photo is processed on the device and never uploaded.
 * The result goes to Instagram stories in one tap.
 */
export function TryOnCover({ domain, createHref }: { domain: string; createHref: string }) {
  const [name, setName] = useState('Айгерим');
  const [style, setStyle] = useState<GlossyStyleId>('vogue');
  const [photo, setPhoto] = useState<CoverPhoto | null>(null);
  const [fonts, setFonts] = useState<CoverFonts | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'sample' });
  const [width, setWidth] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tracerRef = useRef<PortraitTracer | null>(null);
  const inputId = useId();

  const shown = name.trim() || 'Ваше имя';
  const content = useMemo<CoverContent>(() => {
    const now = new Date();
    return { name: shown, issueLine: `№ 01   ·   ${MONTHS[now.getMonth()]} ${now.getFullYear()}   ·   День рождения`, lines: LINES, tagline: TAGLINE };
  }, [shown]);
  const styleName = GLOSSY_STYLES.find((s) => s.id === style)!.name;

  useEffect(() => {
    let alive = true;
    void Promise.all([loadCoverFonts(), loadSample()]).then(([loadedFonts, sample]) => {
      if (!alive) return;
      setFonts(loadedFonts);
      setPhoto((current) => current ?? sample);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const observer = new ResizeObserver(() => setWidth(canvas.clientWidth));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!fonts || !photo || !width) return;
    const canvas = canvasRef.current!;
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round((width * ratio * COVER_SIZE.h) / COVER_SIZE.w);
    const ctx = canvas.getContext('2d')!;
    const scale = canvas.width / COVER_SIZE.w;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawCover(ctx, style, photo, content, fonts);
  }, [fonts, photo, width, style, content]);
  // Drawn in the effect right after this render.
  const drawn = Boolean(fonts && photo && width);

  useEffect(() => () => tracerRef.current?.dispose(), []);

  const tracer = () =>
    (tracerRef.current ??= new PortraitTracer((share) =>
      setStatus((current) => (current.kind === 'working' ? { kind: 'working', step: share < 1 ? 'model' : 'trace', share } : current)),
    ));

  async function onFile(file: File | undefined) {
    if (!file) return;
    setStatus({ kind: 'working', step: 'open' });
    try {
      const picked = await pickPhoto(file);
      setStatus({ kind: 'working', step: 'trace' });
      let failed = false;
      const silhouette = await tracer()
        .trace(picked.preview)
        .catch((error: unknown) => {
          console.warn('Portrait tracing failed', error);
          failed = true;
          return null;
        });
      setPhoto({ image: picked.image, width: picked.width, height: picked.height, silhouette });
      setStatus({ kind: 'mine', person: silhouette ? 'found' : failed ? 'failed' : 'none' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Не получилось открыть фото' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function shareStory() {
    if (!fonts || !photo) return;
    setSharing(true);
    try {
      const canvas = document.createElement('canvas');
      drawStory(canvas, style, photo.image, (ctx) => drawCover(ctx, style, photo, content, fonts), fonts, domain);
      const file = new File([await canvasBlob(canvas)], `coverme-${slug(shown)}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Моя обложка Cover Me' }).catch(() => undefined);
      } else download(file);
    } finally {
      setSharing(false);
    }
  }

  async function saveCover() {
    if (!fonts || !photo) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = Math.round((1240 * COVER_SIZE.h) / COVER_SIZE.w);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(canvas.width / COVER_SIZE.w, canvas.width / COVER_SIZE.w);
    drawCover(ctx, style, photo, content, fonts);
    download(new File([await canvasBlob(canvas, 'image/jpeg', 0.92)], `coverme-${slug(shown)}.jpg`, { type: 'image/jpeg' }));
  }

  function resetToSample() {
    void loadSample().then(setPhoto);
    setStatus({ kind: 'sample' });
  }

  /** Carries the name, the style and the photo into the order: they land in the questionnaire. */
  async function order() {
    setOrdering(true);
    const hero = name.trim();
    const photoFile = photo?.image instanceof HTMLCanvasElement ? await canvasBlob(photo.image, 'image/jpeg', 0.92).catch(() => null) : null;
    await saveHandoff({
      productId: 'glossy',
      ...(hero ? { subject: hero } : {}),
      answers: { hero: { ...(hero ? { heroName: hero } : {}), tone: style } },
      photos: photoFile ? [{ stepId: 'photos', fieldId: 'cover', file: photoFile, name: `cover-${slug(shown)}.jpg` }] : [],
      summary: `обложка из примерки: имя «${shown}», стиль «${styleName}»${photoFile ? ' и ваше фото на обложку' : ''}.`,
    });
    router.push(createHref);
  }

  const working = status.kind === 'working';
  const mine = status.kind === 'mine';

  return (
    <div className="flex flex-col gap-6">
      <figure className="relative aspect-[210/297] w-full overflow-hidden bg-black shadow-[0_30px_60px_-30px_rgba(0,0,0,0.55)]">
        {/* Until the canvas has drawn (fonts, photo), the photo stands in so the hero never flashes empty. */}
        {!drawn && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={SAMPLE_PORTRAIT.src} alt="" className="absolute inset-0 size-full object-cover object-[50%_22%]" />
        )}
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Обложка Cover Me в стиле «${styleName}» с именем ${shown}${mine ? ' и вашим фото' : ''}`}
          className={cn('absolute inset-0 size-full transition-opacity duration-500', drawn ? 'opacity-100' : 'opacity-0')}
        />
        {working && (
          <div className="absolute inset-0 grid place-items-center bg-black/55 p-8 text-center text-white backdrop-blur-[2px]" aria-live="polite">
            <div className="flex w-full max-w-[16rem] flex-col items-center gap-4">
              <span aria-hidden className="size-9 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <p className="font-display text-2xl leading-tight italic">
                {status.step === 'open' ? 'Открываем фото…' : status.step === 'model' ? 'Готовим ретушь…' : 'Ставим вас на обложку…'}
              </p>
              {status.step === 'model' && (
                <>
                  <span className="h-1 w-full overflow-hidden bg-white/25">
                    <span className="block h-full bg-white transition-[width]" style={{ width: `${Math.round((status.share ?? 0) * 100)}%` }} />
                  </span>
                  <p className="text-xs text-white/75">Один раз загружаем модель, дальше быстрее</p>
                </>
              )}
            </div>
          </div>
        )}
      </figure>

      <div className="flex flex-col gap-4">
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        {mine ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void shareStory()} disabled={sharing} className={actionClass('dark')}>
                {sharing ? 'Готовим…' : 'В сторис'}
              </button>
              <button type="button" onClick={() => void saveCover()} className={actionClass()}>
                Скачать обложку
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
              <button type="button" onClick={() => void order()} disabled={ordering} className="font-semibold underline decoration-2 underline-offset-4 hover:text-glossy-fuchsia">
                {ordering ? 'Переносим…' : 'Собрать журнал с этой обложкой →'}
              </button>
              <span className="flex gap-3 text-muted">
                <button type="button" onClick={() => fileRef.current?.click()} className="underline underline-offset-4 hover:text-black">
                  Другое фото
                </button>
                <button type="button" onClick={resetToSample} className="underline underline-offset-4 hover:text-black">
                  Пример
                </button>
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={working}
              onClick={() => fileRef.current?.click()}
              onPointerEnter={() => tracer().warm()}
              onFocus={() => tracer().warm()}
              className={actionClass('dark')}
            >
              <CameraIcon />
              Примерить обложку со своим фото
            </button>
            <p className="text-xs leading-relaxed text-muted">Фото обрабатывается прямо на телефоне и никуда не загружается.</p>
          </div>
        )}
        {status.kind === 'error' && (
          <p role="alert" className="border-l-4 border-glossy-fuchsia pl-3 text-sm">
            {status.message}
          </p>
        )}
        {mine && status.person !== 'found' && (
          <p role="status" className="border-l-4 border-black pl-3 text-sm">
            {status.person === 'none'
              ? 'Не нашли на фото человека крупным планом, поэтому обложка без эффекта глубины. Лучше всего подходит портрет по пояс с запасом над головой.'
              : 'Этот браузер не справился с ретушью, поэтому обложка без эффекта глубины. В журнале мы всё сделаем сами.'}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-sm font-medium">
            Чьё имя поставим на обложку?
          </label>
          <input
            id={inputId}
            value={name}
            maxLength={22}
            onChange={(e) => setName(e.target.value)}
            className="h-12 w-full border-0 border-b-2 border-black bg-transparent px-0 font-display text-2xl italic outline-none focus-visible:border-glossy-fuchsia"
            autoComplete="off"
          />
        </div>

        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-2 text-sm font-medium">Стиль номера</legend>
          {GLOSSY_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={style === s.id}
              onClick={() => setStyle(s.id)}
              className={cn(
                'flex h-9 items-center gap-2 border-2 border-black px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glossy-fuchsia',
                style === s.id ? 'bg-black text-white' : 'bg-white hover:bg-glossy-smoke',
              )}
            >
              <span aria-hidden className="size-3 rounded-full ring-1 ring-black/20" style={{ background: s.swatch }} />
              {s.name}
            </button>
          ))}
        </fieldset>

      </div>
    </div>
  );
}

async function loadSample(): Promise<CoverPhoto> {
  const image = new Image();
  image.src = SAMPLE_PORTRAIT.src;
  await image.decode();
  return { image, width: SAMPLE_PORTRAIT.width, height: SAMPLE_PORTRAIT.height, silhouette: SAMPLE_PORTRAIT.silhouette };
}

function actionClass(tone: 'dark' | 'light' = 'light') {
  return cn(
    'flex h-12 items-center justify-center gap-2 border-2 border-black px-4 text-[15px] font-semibold transition-colors disabled:opacity-60',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glossy-fuchsia',
    tone === 'dark' ? 'bg-black text-white hover:bg-glossy-fuchsia hover:border-glossy-fuchsia' : 'bg-white hover:bg-glossy-smoke',
  );
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-zа-яёәғқңөұүһі0-9]+/gi, '-').replace(/^-|-$/g, '') || 'cover';
}

function CameraIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
