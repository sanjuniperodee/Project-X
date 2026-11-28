'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaRef } from '@px/contracts';
import { useStudioAnswers } from '@/features/voice-studio/ui/studio';
import { GLOSSY_STYLES, type GlossyStyleId } from './styles';
import { COVER_SIZE, drawCover, type CoverContent, type CoverFonts, type CoverPhoto } from './try-on/draw-cover';
import { loadCoverFonts } from './try-on/fonts';
import { pickPhoto } from './try-on/photo';
import { PortraitTracer } from './try-on/tracer';

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const OCCASIONS: Record<string, string> = { birthday: 'День рождения', jubilee: 'Юбилей', wedding: 'Годовщина', corporate: 'Юбилей компании' };

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/**
 * The cover as the conversation fills it in: the name the moment it is said, the style the
 * moment it is chosen, the portrait (with the head in front of the masthead) once it is uploaded.
 * Drawn by the same code as the try-on on the landing, so it is the cover that goes to print.
 */
export function GlossyVoicePreview() {
  const answers = useStudioAnswers();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fonts, setFonts] = useState<CoverFonts | null>(null);
  const [photo, setPhoto] = useState<{ url: string; cover: CoverPhoto } | null>(null);

  const name = text(answers.hero?.heroName);
  const tone = text(answers.hero?.tone);
  const style: GlossyStyleId = GLOSSY_STYLES.some((s) => s.id === tone) ? (tone as GlossyStyleId) : 'vogue';
  const coverUrl = (answers.photos?.cover as MediaRef[] | undefined)?.[0]?.url;
  const occasion = OCCASIONS[text(answers.hero?.occasion)] ?? '';
  const eventDate = text(answers.hero?.eventDate);
  const threeWords = text(answers.interview?.threeWords);

  const content = useMemo<CoverContent>(() => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? new Date(`${eventDate}T00:00:00`) : new Date();
    return {
      name: name || 'Имя героя',
      issueLine: ['№ 01', `${MONTHS[date.getMonth()]} ${date.getFullYear()}`, occasion].filter(Boolean).join('   ·   '),
      lines: [
        { title: 'Большое интервью', text: threeWords || 'Впервые откровенно о главном' },
        { title: 'Друзья рассказали всё', text: 'Истории, которые просили не печатать' },
        { title: 'Правила жизни', text: 'Принципы, которые работают' },
      ],
      tagline: 'Специальный выпуск о человеке, которого мы любим',
    };
  }, [name, occasion, eventDate, threeWords]);

  useEffect(() => {
    let alive = true;
    void loadCoverFonts().then((loaded) => alive && setFonts(loaded));
    return () => {
      alive = false;
    };
  }, []);

  // The uploaded portrait: decoded here, the person traced in a worker (only where the preview is shown).
  useEffect(() => {
    if (!coverUrl || !window.matchMedia('(min-width: 1024px)').matches) return;
    let alive = true;
    const tracer = new PortraitTracer(() => undefined);
    void (async () => {
      const picked = await pickPhoto(await (await fetch(coverUrl)).blob());
      if (!alive) return;
      const cover: CoverPhoto = { image: picked.image, width: picked.width, height: picked.height, silhouette: null };
      setPhoto({ url: coverUrl, cover });
      const silhouette = await tracer.trace(picked.preview).catch(() => null);
      if (alive && silhouette) setPhoto({ url: coverUrl, cover: { ...cover, silhouette } });
    })().catch(() => undefined);
    return () => {
      alive = false;
      tracer.dispose();
    };
  }, [coverUrl]);

  const shown = photo && photo.url === coverUrl ? photo.cover : null;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fonts) return;
    const width = canvas.clientWidth * Math.min(3, window.devicePixelRatio || 1);
    if (!width) return;
    canvas.width = Math.round(width);
    canvas.height = Math.round((width * COVER_SIZE.h) / COVER_SIZE.w);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(canvas.width / COVER_SIZE.w, 0, 0, canvas.width / COVER_SIZE.w, 0, 0);
    drawCover(ctx, style, shown, content, fonts);
  }, [fonts, style, shown, content]);

  if (!name && !coverUrl) return null;
  return (
    <figure className="voice-rise flex flex-col gap-2">
      <canvas ref={canvasRef} role="img" aria-label={`Обложка номера: ${content.name}`} className="aspect-[210/297] w-full shadow-[0_24px_50px_-18px_rgba(0,0,0,0.8)]" />
      <figcaption className="text-xs leading-snug text-muted">Обложка собирается по ходу разговора</figcaption>
    </figure>
  );
}
