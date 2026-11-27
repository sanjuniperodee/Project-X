import { A4, BLEED, mm, type Box, type Page, type PhotoRef, type TextStyle } from '../domain/document';
import { asPhotos, asText } from '../domain/materials';
import type { Flowable, FontMetrics } from '../domain/text';
import {
  columns,
  Composer,
  editorialSections,
  formatDate,
  isListLike,
  paragraphs,
  photoGrid,
  roundToSignature,
  splitLabel,
  type Template,
  type TemplateInput,
} from './template';

/**
 * Cover Me: an A4 glossy magazine of 24 or 36 pages about one hero.
 *
 *  1  cover: full-bleed portrait, masthead, cover lines from the draft cards
 *  2  editor's letter (draft title and lead) with contents
 *  …  articles: one per draft section (interview, rules of life, timeline…), photo openers
 *  …  «Инсайды от друзей»: every contribution with the friend's photos
 *  …  photo pages from the gallery, then a page for guests' wishes if pages remain
 *  N  back cover
 */
const PAPER = '#ffffff';
const INK = '#000000';
const FUCHSIA = '#e4007c';
const SMOKE = '#f2f2f2';
const MUTED = '#5c5c5c';

const MARGIN = mm(15);
const TOP = mm(20);
const BOTTOM = mm(20);
const GUTTER = mm(6);
const CONTENT: Box = { x: MARGIN, y: TOP, w: A4.w - 2 * MARGIN, h: A4.h - TOP - BOTTOM };

const PAGE_COUNTS: Record<string, number> = { 'a4-24': 24, 'a4-36': 36 };
const FRIENDS = /друз|инсайд/i;

function styles(scale: number) {
  const body: TextStyle = { font: 'inter-400', size: 9.6 * scale, leading: 1.45, color: INK, align: 'justify', paragraphSpacing: 5 * scale };
  return {
    body,
    lead: { font: 'playfair-400', size: 15 * scale, leading: 1.35, color: INK } satisfies TextStyle,
    question: { font: 'inter-600', size: 9.6 * scale, leading: 1.4, color: FUCHSIA } satisfies TextStyle,
    heading: { font: 'playfair-700', size: 20 * scale, leading: 1.15, color: INK } satisfies TextStyle,
    rubric: { font: 'inter-600', size: 8, leading: 1.2, color: FUCHSIA, tracking: 1.6, uppercase: true } satisfies TextStyle,
    headline: { font: 'playfair-700', size: 46, leading: 1.02, color: INK } satisfies TextStyle,
    quote: { font: 'playfair-italic', size: 24, leading: 1.25, color: INK } satisfies TextStyle,
    author: { font: 'playfair-700', size: 17 * scale, leading: 1.2, color: INK } satisfies TextStyle,
    relation: { font: 'inter-600', size: 7.5, leading: 1.4, color: FUCHSIA, tracking: 1.2, uppercase: true } satisfies TextStyle,
    wish: { font: 'playfair-italic', size: 11.5 * scale, leading: 1.4, color: INK } satisfies TextStyle,
    folio: { font: 'inter-600', size: 7, leading: 1, color: MUTED, tracking: 1.2, uppercase: true } satisfies TextStyle,
  };
}

export const glossyTemplate: Template = {
  id: 'glossy-magazine@1',

  build(input: TemplateInput, metrics: FontMetrics) {
    const target = PAGE_COUNTS[input.source.formatId] ?? 24;
    // Long texts are set slightly smaller rather than spilling over the format's page count.
    let result = buildMagazine(input, metrics, target, 1);
    for (const scale of [0.93, 0.87]) {
      if (result.contentPages <= target) break;
      result = buildMagazine(input, metrics, target, scale);
    }
    const composer = result.composer;
    if (!PAGE_COUNTS[input.source.formatId]) composer.warn(`Неизвестный формат «${input.source.formatId}», свёрстано на 24 страницы`);
    if (composer.pages.length > target) {
      composer.warn(`Материалов больше, чем помещается в ${target} страниц: макет занял ${composer.pages.length}. Проверьте, не нужно ли сократить текст.`);
    }
    return composer.document(input.draft.title, glossyTemplate.id);
  },
};

function buildMagazine(input: TemplateInput, metrics: FontMetrics, target: number, scale: number) {
  const c = new Composer(input, metrics);
  const s = styles(scale);
  const m = c.materials;
  const hero = m.text('hero', 'heroName') || input.source.subject;

  const coverPhotos = c.resolve(m.photos('photos', 'cover'));
  const gallery = c.resolve(m.photos('photos', 'gallery'));
  const allOwnerPhotos = [...coverPhotos, ...gallery];
  const coverPhoto = coverPhotos[0] ?? allOwnerPhotos.find((p) => p.height >= p.width) ?? allOwnerPhotos[0];
  if (!coverPhoto) c.warn('Нет ни одного фото для обложки: обложка свёрстана без портрета');

  // ---- 1. Cover ----
  const cover = c.addPage('cover', A4, coverPhoto ? INK : FUCHSIA);
  if (coverPhoto) {
    c.image(cover, coverPhoto, { x: -BLEED, y: -BLEED, w: A4.w + 2 * BLEED, h: A4.h + 2 * BLEED }, { focusY: 0.25 });
    c.rect(cover, { x: -BLEED, y: -BLEED, w: A4.w + 2 * BLEED, h: mm(62) + BLEED }, INK, { opacity: 0.28 });
    c.rect(cover, { x: -BLEED, y: A4.h - mm(120), w: A4.w + 2 * BLEED, h: mm(120) + BLEED }, INK, { opacity: 0.32 });
  }
  c.fit(cover, 'COVER ME', { font: 'playfair-700', size: 118, leading: 1, color: PAPER, align: 'center', tracking: 2 }, { x: MARGIN, y: mm(12), w: CONTENT.w, h: mm(40) }, { minSize: 60, maxLines: 1 });
  const issue = ['Выпуск № 1', m.optionLabel('hero', 'occasion'), formatDate(m.text('hero', 'eventDate'))].filter(Boolean).join('  ·  ');
  c.fit(cover, issue, { font: 'inter-600', size: 8.5, leading: 1.2, color: PAPER, align: 'center', tracking: 2, uppercase: true }, { x: MARGIN, y: mm(52), w: CONTENT.w, h: mm(6) }, { minSize: 6, maxLines: 1 });

  let lineY = A4.h - mm(112);
  const coverLines = input.draft.cards.slice(0, 4);
  coverLines.forEach((card, i) => {
    const box = { x: MARGIN, y: lineY, w: mm(78), h: mm(22) };
    if (i === 0) {
      c.rect(cover, { x: MARGIN, y: lineY - mm(7), w: mm(24), h: mm(5) }, FUCHSIA);
      c.fit(cover, 'Эксклюзив', { font: 'inter-600', size: 7, leading: 1, color: PAPER, align: 'center', tracking: 1.4, uppercase: true }, { x: MARGIN, y: lineY - mm(5.9), w: mm(24), h: mm(4) }, { minSize: 5, maxLines: 1 });
    }
    const used = c.fit(cover, card.title, { font: 'playfair-700', size: 17, leading: 1.1, color: PAPER }, box, { minSize: 11, maxLines: 2 });
    const textUsed = c.fit(cover, card.text, { font: 'inter-400', size: 8.5, leading: 1.35, color: PAPER }, { ...box, y: lineY + used + mm(1), h: mm(10) }, { minSize: 7, maxLines: 2 });
    lineY += used + textUsed + mm(5);
  });
  c.fit(cover, hero, { font: 'playfair-700', size: 96, leading: 0.95, color: PAPER, align: 'right' }, { x: mm(98), y: A4.h - mm(80), w: A4.w - mm(98) - MARGIN, h: mm(62) }, { minSize: 36, maxLines: 2, verticalAlign: 'bottom' });

  // ---- 2. Editor's letter (contents filled in at the end) ----
  const letter = c.addPage('letter', A4, PAPER);
  c.fit(letter, 'Письмо редактора', s.rubric, { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) }, { minSize: 6, maxLines: 1 });
  const titleUsed = c.fit(letter, input.draft.title, s.headline, { x: MARGIN, y: TOP + mm(9), w: CONTENT.w, h: mm(60) }, { minSize: 26, maxLines: 3 });
  const leadBox = { x: MARGIN, y: TOP + mm(9) + titleUsed + mm(8), w: mm(112), h: mm(110) };
  c.text(letter, [{ text: input.draft.lead, style: s.lead }], leadBox);
  folio(c, letter, 2, s);

  // ---- 3. Articles ----
  const sections = editorialSections(input, ['hero', 'photos']).filter(
    (section) => !(FRIENDS.test(section.heading) && input.source.contributions.length > 0),
  );
  const contents: Array<{ title: string; page: number }> = [];
  const openerPhotos = gallery.filter((p) => p !== coverPhoto);
  sections.forEach((section, index) => {
    contents.push({ title: section.heading, page: c.pages.length + 1 });
    // Every article opens with a photo while the gallery has enough left for the photo pages.
    const opener = index === 0 || openerPhotos.filter((p) => !c.isUsed(p)).length > 6 ? openerPhotos.find((p) => !c.isUsed(p)) : undefined;
    if (isListLike(section.body)) listArticle(c, section, s);
    else article(c, section, s, opener);
  });

  // ---- 4. Friends ----
  const friendsStep = input.product.steps.find((st) => st.audience === 'contributor');
  if (input.source.contributions.length > 0 && friendsStep) {
    contents.push({ title: 'Инсайды от друзей', page: c.pages.length + 1 });
    friendsPages(c, s, friendsStep.id);
  }

  // ---- 5. Photo pages and wishes, up to the format ----
  const contentPages = c.pages.length + 1; // + back cover
  const free = Math.max(0, target - contentPages);
  const remaining = allOwnerPhotos.filter((p) => !c.isUsed(p));
  if (free > 0 && remaining.length > 0) contents.push({ title: 'Фотосессия', page: c.pages.length + 1 });
  // About two photos a page on average, alternating layouts (1, 3, 2, 4…) so spreads do not repeat.
  const photoPages = Math.min(free, Math.ceil(remaining.length / 2));
  const rhythm = [1, 3, 2, 4, 2, 1, 4, 3];
  let cursor = 0;
  for (let i = 0; i < photoPages; i++) {
    const left = remaining.length - cursor;
    const pagesLeft = photoPages - i;
    const wanted = rhythm[i % rhythm.length]!;
    const perPage = Math.max(1, Math.min(4, left - (pagesLeft - 1), Math.max(wanted, Math.ceil(left / pagesLeft))));
    photoPage(c, remaining.slice(cursor, cursor + perPage), s);
    cursor += perPage;
  }
  if (cursor < remaining.length) c.warn(`Не поместилось ${remaining.length - cursor} фото из галереи`);

  // Pages still free: big quotes from the friends' wishes, then pages for guests' autographs.
  const total = Math.max(target, roundToSignature(c.pages.length + 1));
  const quotes = wishes(c, friendsStep?.id);
  let wishPages = 0;
  while (c.pages.length + 1 < total) {
    if (wishPages > 0 && quotes.length > 0) quotePage(c, quotes.shift()!, s);
    else {
      wishesPage(c, s);
      wishPages++;
    }
  }
  if (wishPages > 2) {
    c.warn(`Материалов мало: ${wishPages} страниц отданы под пожелания гостей. Стоит попросить у клиента ещё фото или историй.`);
  }

  // ---- 6. Back cover ----
  backCover(c, s, allOwnerPhotos.find((p) => !c.isUsed(p)) ?? coverPhoto);

  // Contents on the letter page.
  let y = leadBox.y + Math.min(leadBox.h, c.measure([{ text: input.draft.lead, style: s.lead }], leadBox.w)) + mm(14);
  c.fit(letter, 'В номере', s.rubric, { x: MARGIN, y, w: CONTENT.w, h: mm(5) }, { minSize: 6, maxLines: 1 });
  y += mm(8);
  for (const entry of contents.slice(0, 12)) {
    if (y > A4.h - BOTTOM - mm(12)) break;
    c.fit(letter, String(entry.page).padStart(2, '0'), { font: 'playfair-700', size: 22, leading: 1, color: FUCHSIA }, { x: MARGIN, y, w: mm(16), h: mm(9) }, { minSize: 14, maxLines: 1 });
    c.fit(letter, entry.title, { font: 'inter-600', size: 10.5, leading: 1.2, color: INK }, { x: MARGIN + mm(18), y: y + mm(1.6), w: CONTENT.w - mm(18), h: mm(6) }, { minSize: 8, maxLines: 1 });
    y += mm(11);
  }

  return { composer: c, contentPages };
}

function folio(c: Composer, page: Page, number: number, s: ReturnType<typeof styles>) {
  const even = number % 2 === 0;
  c.fit(page, `${even ? `${number}   ` : ''}Cover Me${even ? '' : `   ${number}`}`, { ...s.folio, align: even ? 'left' : 'right' }, { x: MARGIN, y: A4.h - mm(12), w: CONTENT.w, h: mm(4) }, { minSize: 5, maxLines: 1 });
}

function sectionFlowables(section: { heading: string; body: string }, s: ReturnType<typeof styles>): Flowable[] {
  return paragraphs(section.body).flatMap((p): Flowable[] => {
    const qa = splitLabel(p);
    if (qa) return [{ text: qa.label, style: s.question, keepWithNext: true, spaceBefore: 6 }, { text: qa.value, style: s.body }];
    return [{ text: p, style: s.body }];
  });
}

/** Prose article: photo opener (if there is a photo), headline, two justified columns over as many pages as needed. */
function article(c: Composer, section: { heading: string; body: string }, s: ReturnType<typeof styles>, photo: PhotoRef | undefined) {
  const page = c.addPage('article', A4, PAPER);
  let top = TOP;
  if (photo) {
    c.image(page, photo, { x: -BLEED, y: -BLEED, w: A4.w + 2 * BLEED, h: mm(128) + BLEED });
    top = mm(136);
  }
  c.fit(page, section.heading.length > 40 ? 'Тема номера' : 'Большая история', s.rubric, { x: MARGIN, y: top, w: CONTENT.w, h: mm(5) }, { minSize: 6, maxLines: 1 });
  const used = c.fit(page, section.heading, { ...s.headline, size: photo ? 38 : 46 }, { x: MARGIN, y: top + mm(7), w: CONTENT.w, h: mm(36) }, { minSize: 22, maxLines: 2 });
  c.line(page, { x: MARGIN, y: top + mm(9) + used }, { x: MARGIN + mm(30), y: top + mm(9) + used }, FUCHSIA, 2);
  const bodyTop = top + mm(15) + used;
  const flow = c.story(sectionFlowables(section, s), (CONTENT.w - GUTTER) / 2);
  c.flow(page, flow, columns({ x: MARGIN, y: bodyTop, w: CONTENT.w, h: A4.h - BOTTOM - bodyTop }, 2, GUTTER));
  folio(c, page, c.pages.length, s);
  while (!flow.done) {
    const next = c.addPage('article', A4, PAPER);
    c.fit(next, section.heading, s.rubric, { x: MARGIN, y: TOP - mm(8), w: CONTENT.w, h: mm(5) }, { minSize: 6, maxLines: 1 });
    c.flow(next, flow, columns(CONTENT, 2, GUTTER));
    folio(c, next, c.pages.length, s);
  }
}

/** Lists (rules of life, facts): big numbers in the accent colour, two columns. */
function listArticle(c: Composer, section: { heading: string; body: string }, s: ReturnType<typeof styles>) {
  const items = paragraphs(section.body).map((p) => p.replace(/^[-–—•\d.)\s]+/, '').trim()).filter(Boolean);
  const page = c.addPage('rules', A4, SMOKE);
  c.fit(page, 'Рубрика', s.rubric, { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) }, { minSize: 6, maxLines: 1 });
  const used = c.fit(page, section.heading, s.headline, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(40) }, { minSize: 24, maxLines: 2 });
  const flowables = items.flatMap((item, i): Flowable[] => [
    { text: String(i + 1).padStart(2, '0'), style: { font: 'playfair-700', size: 30, leading: 1.05, color: FUCHSIA }, keepWithNext: true, spaceBefore: 12 },
    { text: item, style: { font: 'playfair-400', size: 16, leading: 1.3, color: INK } },
  ]);
  const top = TOP + mm(16) + used;
  const flow = c.story(flowables, (CONTENT.w - GUTTER * 2) / 2);
  c.flow(page, flow, columns({ x: MARGIN, y: top, w: CONTENT.w, h: A4.h - BOTTOM - top }, 2, GUTTER * 2));
  folio(c, page, c.pages.length, s);
  while (!flow.done) {
    const next = c.addPage('rules', A4, SMOKE);
    c.flow(next, flow, columns(CONTENT, 2, GUTTER * 2));
    folio(c, next, c.pages.length, s);
  }
}

/** Friends' stories in their own words, with their photos in a strip on each page. */
function friendsPages(c: Composer, s: ReturnType<typeof styles>, stepId: string) {
  const entries = c.input.source.contributions.map((contribution) => {
    const answers = contribution.answers[stepId] ?? {};
    return {
      author: contribution.authorName,
      relation: asText(answers.relation),
      story: asText(answers.story),
      wish: asText(answers.wish),
      photos: c.resolve(asPhotos(answers.photos)),
    };
  });
  const flowables = entries.flatMap((e): Flowable[] => [
    { text: e.author, style: s.author, keepWithNext: true, spaceBefore: 14 },
    ...(e.relation ? [{ text: e.relation, style: s.relation, keepWithNext: true, spaceBefore: 2 }] : []),
    ...paragraphs(e.story).map((p, i) => ({ text: p, style: { ...s.body, align: 'left' as const }, spaceBefore: i === 0 ? 4 : 0 })),
    ...(e.wish ? [{ text: `«${e.wish}»`, style: s.wish, spaceBefore: 5 }] : []),
  ]);
  const photos = entries.flatMap((e) => e.photos);
  const flow = c.story(flowables, (CONTENT.w - GUTTER) / 2);
  let first = true;
  while (!flow.done) {
    const page = c.addPage('friends', A4, PAPER);
    let top = TOP;
    if (first) {
      c.fit(page, 'Рубрика', s.rubric, { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) }, { minSize: 6, maxLines: 1 });
      const used = c.fit(page, 'Инсайды от друзей', s.headline, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(24) }, { minSize: 26, maxLines: 1 });
      top = TOP + mm(12) + used;
      first = false;
    }
    const strip = c.take(photos.filter((p) => !c.isUsed(p)), 3);
    if (strip.length > 0) {
      const h = mm(52);
      const w = (CONTENT.w - GUTTER * (strip.length - 1)) / strip.length;
      strip.forEach((photo, i) => c.image(page, photo, { x: MARGIN + i * (w + GUTTER), y: top, w, h }));
      top += h + mm(6);
    }
    c.flow(page, flow, columns({ x: MARGIN, y: top, w: CONTENT.w, h: A4.h - BOTTOM - top }, 2, GUTTER));
    folio(c, page, c.pages.length, s);
  }
}

function photoPage(c: Composer, photos: PhotoRef[], s: ReturnType<typeof styles>) {
  const page = c.addPage('photos', A4, PAPER);
  if (photos.length === 1) {
    c.image(page, photos[0]!, { x: -BLEED, y: -BLEED, w: A4.w + 2 * BLEED, h: A4.h + 2 * BLEED });
    return;
  }
  const boxes = photoGrid({ x: MARGIN, y: TOP, w: CONTENT.w, h: CONTENT.h - mm(4) }, photos.length, mm(4));
  photos.forEach((photo, i) => c.image(page, photo, boxes[i]!));
  folio(c, page, c.pages.length, s);
}

function wishes(c: Composer, stepId: string | undefined): Array<{ text: string; author: string }> {
  if (!stepId) return [];
  return c.input.source.contributions
    .map((contribution) => ({ text: asText(contribution.answers[stepId]?.wish), author: contribution.authorName }))
    .filter((w) => w.text.length > 0);
}

function quotePage(c: Composer, quote: { text: string; author: string }, s: ReturnType<typeof styles>) {
  const page = c.addPage('quote', A4, FUCHSIA);
  c.fit(page, '«', { font: 'playfair-700', size: 160, leading: 1, color: PAPER }, { x: MARGIN, y: mm(40), w: mm(40), h: mm(50) }, { minSize: 80, maxLines: 1 });
  const used = c.fit(page, quote.text, { font: 'playfair-italic', size: 40, leading: 1.2, color: PAPER }, { x: MARGIN, y: mm(90), w: CONTENT.w, h: mm(130) }, { minSize: 18, maxLines: 9 });
  c.fit(page, `— ${quote.author}`, { ...s.relation, color: PAPER, size: 9 }, { x: MARGIN, y: mm(96) + used, w: CONTENT.w, h: mm(6) }, { minSize: 6, maxLines: 1 });
  folio(c, page, c.pages.length, s);
}

/** Lined page for guests to sign at the party. */
function wishesPage(c: Composer, s: ReturnType<typeof styles>) {
  const page = c.addPage('wishes', A4, PAPER);
  c.fit(page, 'Автографы', s.rubric, { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) }, { minSize: 6, maxLines: 1 });
  c.fit(page, 'Пожелания гостей', s.headline, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(24) }, { minSize: 24, maxLines: 1 });
  for (let y = TOP + mm(44); y < A4.h - BOTTOM; y += mm(12)) c.line(page, { x: MARGIN, y }, { x: A4.w - MARGIN, y }, '#c8c8c8', 0.5);
  folio(c, page, c.pages.length, s);
}

function backCover(c: Composer, s: ReturnType<typeof styles>, photo: PhotoRef | undefined) {
  const page = c.addPage('back', A4, SMOKE);
  if (photo) {
    const d = mm(70);
    c.image(page, photo, { x: (A4.w - d) / 2, y: mm(70), w: d, h: d }, { shape: 'circle' });
  }
  const closing = c.input.draft.cards.at(-1);
  c.fit(page, closing?.title ?? 'Продолжение следует', { ...s.quote, align: 'center' }, { x: MARGIN + mm(10), y: mm(152), w: CONTENT.w - mm(20), h: mm(40) }, { minSize: 14, maxLines: 3 });
  c.fit(page, 'COVER ME', { font: 'playfair-700', size: 26, leading: 1, color: INK, align: 'center', tracking: 2 }, { x: MARGIN, y: A4.h - mm(42), w: CONTENT.w, h: mm(12) }, { minSize: 14, maxLines: 1 });
  c.fit(page, 'Сделано с любовью · coverme.kz', { ...s.folio, align: 'center' }, { x: MARGIN, y: A4.h - mm(28), w: CONTENT.w, h: mm(4) }, { minSize: 5, maxLines: 1 });
}
