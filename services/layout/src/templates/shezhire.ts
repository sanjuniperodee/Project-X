import { A4, mm, type Box, type Page, type PhotoRef, type TextStyle } from '../domain/document';
import { asPhotos, asText } from '../domain/materials';
import type { Flowable, FontMetrics } from '../domain/text';
import { BlockFlow, Composer, editorialSections, paragraphs, roundToSignature, type Template, type TemplateInput } from './template';

/**
 * Шежіре: a family book (A4, 48 or 64 pages).
 *
 *  cover (ornamental frame, family name) · dedication · foreword (draft lead) · contents
 *  family tree by generation · chronicle chapters (draft) · one chapter per generation with bios and photos
 *  family stories · relatives' memories · family archive photos · pages for descendants · colophon
 */
const INDIGO = '#18213f';
const GOLD = '#c7a257';
const PAPER = '#f1eadf';
const INK = '#1f1c18';
const MUTED = '#6e6559';
const MADDER = '#9b3b2e';
const PLAQUE = '#f8f3eb';

const MARGIN = mm(20);
const TOP = mm(24);
const BOTTOM = mm(24);
const CONTENT: Box = { x: MARGIN, y: TOP, w: A4.w - 2 * MARGIN, h: A4.h - TOP - BOTTOM };

const PAGE_COUNTS: Record<string, number> = { book: 48, 'book-poster': 48, heritage: 64 };

/** Oldest first: the book reads from the ancestors down to the children. */
const GENERATIONS = ['ancestors', 'great-grandparents', 'grandparents', 'parents', 'self', 'children'] as const;

const styles = {
  body: { font: 'literata-400', size: 10.2, leading: 1.55, color: INK, align: 'justify', paragraphSpacing: 4 } satisfies TextStyle,
  italic: { font: 'literata-italic', size: 10.2, leading: 1.5, color: MUTED } satisfies TextStyle,
  chapterNo: { font: 'cormorant-italic', size: 16, leading: 1.2, color: MADDER, align: 'center' } satisfies TextStyle,
  chapter: { font: 'cormorant-600', size: 38, leading: 1.05, color: INDIGO, align: 'center' } satisfies TextStyle,
  name: { font: 'cormorant-600', size: 21, leading: 1.1, color: INDIGO } satisfies TextStyle,
  heading: { font: 'cormorant-600', size: 17, leading: 1.15, color: INDIGO } satisfies TextStyle,
  label: { font: 'literata-600', size: 7.5, leading: 1.3, color: MADDER, tracking: 1.4, uppercase: true } satisfies TextStyle,
  folio: { font: 'cormorant-italic', size: 11, leading: 1, color: MUTED, align: 'center' } satisfies TextStyle,
};

interface Member {
  name: string;
  generation: string;
  line: string;
  years: string;
  bio: string;
  photos: PhotoRef[];
}

export const shezhireTemplate: Template = {
  id: 'shezhire-book@1',

  build(input: TemplateInput, metrics: FontMetrics) {
    const c = new Composer(input, metrics);
    const m = c.materials;
    const target = PAGE_COUNTS[input.source.formatId] ?? 48;
    if (!PAGE_COUNTS[input.source.formatId]) c.warn(`Неизвестный формат «${input.source.formatId}», свёрстано на 48 страниц`);
    if (input.source.formatId !== 'book') c.warn('Постер или холст с древом верстается отдельно, в этот PDF входит только книга');

    const family = m.text('family', 'familyName') || input.source.subject;
    const members: Member[] = m.list('tree', 'members').map((item) => ({
      name: asText(item.fullName),
      generation: asText(item.generation),
      line: asText(item.line),
      years: asText(item.years),
      bio: asText(item.bio),
      photos: c.resolve(asPhotos(item.photos)),
    })).filter((member) => member.name);
    // Short bios written by the editor (draft cards) fill in for relatives the family wrote nothing about.
    for (const member of members) {
      if (member.bio) continue;
      const card = input.draft.cards.find((card) => card.title.toLowerCase().startsWith(member.name.toLowerCase()));
      if (card) member.bio = card.text;
    }

    // ---- Cover ----
    const cover = c.addPage('cover', A4, INDIGO);
    ornamentFrame(c, cover, GOLD);
    c.fit(cover, 'Шежіре', { font: 'cormorant-italic', size: 30, leading: 1, color: GOLD, align: 'center' }, { x: MARGIN, y: mm(78), w: CONTENT.w, h: mm(14) }, { minSize: 18, maxLines: 1 });
    c.fit(cover, family, { font: 'cormorant-600', size: 64, leading: 1.02, color: PAPER, align: 'center' }, { x: MARGIN + mm(8), y: mm(100), w: CONTENT.w - mm(16), h: mm(60) }, { minSize: 30, maxLines: 2, verticalAlign: 'middle' });
    diamondRule(c, cover, mm(168), GOLD);
    const origin = [m.text('family', 'ru'), m.text('family', 'homeland')].filter(Boolean).join(' · ');
    c.fit(cover, origin, { font: 'literata-400', size: 11, leading: 1.4, color: GOLD, align: 'center', tracking: 0.6 }, { x: MARGIN + mm(10), y: mm(178), w: CONTENT.w - mm(20), h: mm(16) }, { minSize: 8, maxLines: 2 });
    c.fit(cover, 'Книга рода', { ...styles.label, color: GOLD, align: 'center', size: 9 }, { x: MARGIN, y: A4.h - mm(52), w: CONTENT.w, h: mm(5) }, { minSize: 6, maxLines: 1 });

    // ---- Dedication ----
    const dedication = m.text('family', 'dedication');
    const dedicationPage = c.addPage('dedication', A4, PAPER);
    c.fit(dedicationPage, dedication || `Тем, кто был до нас, и тем, кто будет после. Семья ${family}.`, { font: 'cormorant-italic', size: 22, leading: 1.35, color: INDIGO, align: 'center' }, { x: MARGIN + mm(16), y: mm(90), w: CONTENT.w - mm(32), h: mm(110) }, { minSize: 13, maxLines: 10, verticalAlign: 'middle' });

    // ---- Foreword ----
    const contents: Array<{ title: string; page: number }> = [];
    const foreword = newPage(c, 'foreword');
    contents.push({ title: 'Вступительное слово', page: c.pages.length });
    const flow = new BlockFlow(c, CONTENT, () => newPage(c, 'text'), { page: foreword, y: TOP });
    chapterTitle(c, flow, null, 'Вступительное слово');
    flow.text(paragraphs(input.draft.lead).map((p) => ({ text: p, style: styles.body })));

    // ---- Contents (filled at the end) ----
    const contentsPage = newPage(c, 'contents');

    // ---- Family tree ----
    if (members.length > 0) {
      contents.push({ title: 'Древо рода', page: c.pages.length + 1 });
      familyTree(c, members, m.field('tree', 'members'));
    } else {
      c.warn('В анкете нет ни одного родственника: древо не свёрстано');
    }

    // ---- Chronicle chapters from the editor ----
    let chapterNo = 1;
    const chronicle = editorialSections(input, ['family', 'tree', 'archive']);
    const usesTemplateGenerator = input.draft.generator === 'template';
    for (const section of chronicle) {
      if (usesTemplateGenerator) continue; // step dumps of the template generator are not book text
      const page = newPage(c, 'chapter');
      contents.push({ title: section.heading, page: c.pages.length });
      const chapter = new BlockFlow(c, CONTENT, () => newPage(c, 'text'), { page, y: TOP + mm(30) });
      chapterTitle(c, chapter, `Глава ${chapterNo++}`, section.heading);
      chapter.text(paragraphs(section.body).map((p) => ({ text: p, style: styles.body })));
    }

    // ---- Generations ----
    const generationLabel = (value: string) => optionLabel(m.field('tree', 'members'), 'generation', value);
    // Generations follow each other on the same page while there is room; a sparse family stays compact.
    let generations: BlockFlow | null = null;
    for (const generation of [...GENERATIONS, '']) {
      const people = members.filter((p) => (generation ? p.generation === generation : !GENERATIONS.includes(p.generation as never)));
      if (people.length === 0) continue;
      const title = generation ? generationLabel(generation) || 'Поколение' : 'Родные';
      if (!generations || generations.remaining < CONTENT.h * 0.45) {
        const page = newPage(c, 'generation');
        generations = new BlockFlow(c, CONTENT, () => newPage(c, 'generation'), { page, y: TOP + mm(30) });
      } else {
        generations.space(mm(18));
      }
      contents.push({ title, page: c.pages.length });
      chapterTitle(c, generations, `Глава ${chapterNo++}`, title);
      for (const person of people) memberEntry(c, generations, person, m.field('tree', 'members'));
    }

    // ---- Family stories in the family's own words (the editor retells them when Claude writes the draft) ----
    const stories = m.list('stories', 'stories').map((s) => ({ title: asText(s.title), period: asText(s.period), text: asText(s.text) })).filter((s) => s.text);
    if (stories.length > 0 && (usesTemplateGenerator || chronicle.length === 0)) {
      const page = newPage(c, 'chapter');
      contents.push({ title: 'Семейные истории', page: c.pages.length });
      const chapter = new BlockFlow(c, CONTENT, () => newPage(c, 'text'), { page, y: TOP + mm(30) });
      chapterTitle(c, chapter, `Глава ${chapterNo++}`, 'Семейные истории');
      for (const story of stories) {
        chapter.text([
          { text: story.title, style: styles.heading, keepWithNext: true, spaceBefore: 16 },
          ...(story.period ? [{ text: story.period, style: styles.label, keepWithNext: true, spaceBefore: 3 }] : []),
          ...paragraphs(story.text).map((p, i) => ({ text: p, style: styles.body, spaceBefore: i === 0 ? 6 : 0 })),
        ]);
      }
    }

    // ---- Relatives' memories ----
    const memoriesStep = input.product.steps.find((st) => st.audience === 'contributor');
    if (memoriesStep && input.source.contributions.length > 0) {
      const page = newPage(c, 'memories');
      contents.push({ title: 'Воспоминания родных', page: c.pages.length });
      const chapter = new BlockFlow(c, CONTENT, () => newPage(c, 'memories'), { page, y: TOP + mm(30) });
      chapterTitle(c, chapter, `Глава ${chapterNo++}`, 'Воспоминания родных');
      for (const contribution of input.source.contributions) {
        const a = contribution.answers[memoriesStep.id] ?? {};
        const about = asText(a.aboutWhom);
        const photos = c.resolve(asPhotos(a.photos)).filter((p) => !c.isUsed(p)).slice(0, 2);
        chapter.text([
          { text: about ? `О ${about}` : contribution.authorName, style: styles.heading, keepWithNext: true, spaceBefore: 16 },
          { text: [contribution.authorName, asText(a.relation)].filter(Boolean).join(', '), style: styles.italic, keepWithNext: true, spaceBefore: 2 },
          ...paragraphs(asText(a.story)).map((p, i) => ({ text: p, style: styles.body, spaceBefore: i === 0 ? 6 : 0 })),
        ]);
        if (photos.length > 0) photoRow(c, chapter, photos);
      }
    }

    // ---- Archive ----
    const archive = c.resolve(m.photos('archive', 'archive')).filter((p) => !c.isUsed(p));
    const available = Math.max(0, target - c.pages.length - 1);
    if (archive.length > 0) {
      contents.push({ title: 'Из семейного архива', page: c.pages.length + 1 });
      const perPage = Math.max(2, Math.min(4, Math.ceil(archive.length / Math.max(1, available))));
      for (let i = 0; i < archive.length; i += perPage) archivePage(c, archive.slice(i, i + perPage));
      if (c.pages.length + 1 > target) c.warn(`Архивных фото больше, чем помещается в ${target} страниц: книга заняла больше страниц`);
    }

    // ---- Pages for descendants, colophon ----
    const total = Math.max(target, roundToSignature(c.pages.length + 1));
    let notes = 0;
    while (c.pages.length + 1 < total) {
      notesPage(c);
      notes++;
    }
    if (notes > 4) c.warn(`Материалов мало: ${notes} страниц книги остались для заметок. Стоит попросить у семьи ещё истории и фото.`);
    colophon(c, family);
    if (c.pages.length > target) c.warn(`Книга заняла ${c.pages.length} страниц вместо ${target}`);

    // Contents.
    const list = new BlockFlow(c, CONTENT, () => contentsPage, { page: contentsPage, y: TOP + mm(30) });
    chapterTitle(c, list, null, 'Содержание');
    for (const entry of contents.slice(0, 18)) {
      list.block(mm(10), (page, y) => {
        c.fit(page, entry.title, { font: 'cormorant-600', size: 15, leading: 1.2, color: INK }, { x: MARGIN + mm(10), y, w: CONTENT.w - mm(40), h: mm(8) }, { minSize: 10, maxLines: 1 });
        c.fit(page, String(entry.page), { font: 'cormorant-italic', size: 15, leading: 1.2, color: MADDER, align: 'right' }, { x: A4.w - MARGIN - mm(30), y, w: mm(20), h: mm(8) }, { minSize: 10, maxLines: 1 });
      });
    }

    return c.document(input.draft.title || `Шежіре: ${family}`, shezhireTemplate.id);
  },
};

function optionLabel(field: ReturnType<Composer['materials']['field']>, leafId: string, value: string): string {
  if (!field || field.type !== 'list') return value;
  const leaf = field.fields.find((f) => f.id === leafId);
  if (!leaf || (leaf.type !== 'select' && leaf.type !== 'choice')) return value;
  return leaf.options.find((o) => o.value === value)?.label ?? value;
}

function newPage(c: Composer, kind: string): Page {
  const page = c.addPage(kind, A4, PAPER);
  const number = c.pages.length;
  c.fit(page, `— ${number} —`, styles.folio, { x: MARGIN, y: A4.h - mm(15), w: CONTENT.w, h: mm(5) }, { minSize: 8, maxLines: 1 });
  return page;
}

function chapterTitle(c: Composer, flow: BlockFlow, number: string | null, title: string) {
  if (number) flow.block(mm(9), (page, y) => c.fit(page, number, styles.chapterNo, { x: MARGIN, y, w: CONTENT.w, h: mm(8) }, { minSize: 10, maxLines: 1 }));
  const height = Math.min(mm(40), c.measure([{ text: title, style: styles.chapter }], CONTENT.w - mm(20)));
  flow.block(height + mm(4), (page, y) => c.fit(page, title, styles.chapter, { x: MARGIN + mm(10), y, w: CONTENT.w - mm(20), h: mm(40) }, { minSize: 22, maxLines: 2 }));
  flow.block(mm(12), (page, y) => diamondRule(c, page, y + mm(3), GOLD));
}

/** Double gold frame with corner diamonds. */
function ornamentFrame(c: Composer, page: Page, color: string) {
  const outer = { x: mm(12), y: mm(12), w: A4.w - mm(24), h: A4.h - mm(24) };
  const inner = { x: mm(16), y: mm(16), w: A4.w - mm(32), h: A4.h - mm(32) };
  c.rect(page, outer, undefined, { stroke: { color, width: 1.4 } });
  c.rect(page, inner, undefined, { stroke: { color, width: 0.5 } });
  for (const [x, y] of [
    [outer.x, outer.y],
    [outer.x + outer.w, outer.y],
    [outer.x, outer.y + outer.h],
    [outer.x + outer.w, outer.y + outer.h],
  ] as const) {
    page.elements.push({ type: 'path', d: diamond(x, y, mm(5)), fill: color });
  }
}

function diamond(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z`;
}

function diamondRule(c: Composer, page: Page, y: number, color: string) {
  const cx = A4.w / 2;
  c.line(page, { x: cx - mm(30), y }, { x: cx - mm(4), y }, color, 0.8);
  c.line(page, { x: cx + mm(4), y }, { x: cx + mm(30), y }, color, 0.8);
  page.elements.push({ type: 'path', d: diamond(cx, y, mm(2.2)), fill: color });
}

/**
 * Family tree as generational tiers, oldest at the top: paternal line on the left, maternal on the right.
 * The questionnaire has no parent–child links, so tiers are connected by a trunk line.
 */
function familyTree(c: Composer, members: Member[], field: ReturnType<Composer['materials']['field']>) {
  const plaque = { w: mm(31), h: mm(15), gap: mm(3) };
  const perRow = Math.floor((CONTENT.w - mm(24) + plaque.gap) / (plaque.w + plaque.gap));
  const tiers = [...GENERATIONS, '']
    .map((generation) => ({
      generation,
      people: members
        .filter((p) => (generation ? p.generation === generation : !GENERATIONS.includes(p.generation as never)))
        .sort((a, b) => lineOrder(a.line) - lineOrder(b.line)),
    }))
    .filter((tier) => tier.people.length > 0);

  let page = treePage(c, true);
  let y = TOP + mm(34);
  let previousBottom: number | null = null;
  for (const tier of tiers) {
    const rows = Math.ceil(tier.people.length / perRow);
    const height = mm(7) + rows * (plaque.h + plaque.gap);
    if (y + height > A4.h - BOTTOM) {
      page = treePage(c, false);
      y = TOP + mm(12);
      previousBottom = null;
    }
    const label = tier.generation ? optionLabel(field, 'generation', tier.generation) : 'Родные';
    c.fit(page, label, { ...styles.label, align: 'center' }, { x: MARGIN, y, w: CONTENT.w, h: mm(5) }, { minSize: 6, maxLines: 1 });
    if (previousBottom !== null) c.line(page, { x: A4.w / 2, y: previousBottom }, { x: A4.w / 2, y: y - mm(1) }, GOLD, 1);
    y += mm(7);
    for (let row = 0; row < rows; row++) {
      const people = tier.people.slice(row * perRow, (row + 1) * perRow);
      const rowWidth = people.length * plaque.w + (people.length - 1) * plaque.gap;
      let x = (A4.w - rowWidth) / 2;
      if (people.length > 1) c.line(page, { x: x + plaque.w / 2, y: y - mm(1.5) }, { x: x + rowWidth - plaque.w / 2, y: y - mm(1.5) }, GOLD, 0.8);
      for (const person of people) {
        const accent = person.line === 'maternal' ? MADDER : INDIGO;
        c.line(page, { x: x + plaque.w / 2, y: y - mm(1.5) }, { x: x + plaque.w / 2, y }, GOLD, 0.8);
        c.rect(page, { x, y, w: plaque.w, h: plaque.h }, PLAQUE, { stroke: { color: accent, width: 0.8 }, radius: mm(1.5) });
        c.fit(page, person.name, { font: 'cormorant-600', size: 11, leading: 1.05, color: INK, align: 'center' }, { x: x + mm(1.5), y: y + mm(1.5), w: plaque.w - mm(3), h: mm(8.5) }, { minSize: 6.5, maxLines: 2, verticalAlign: 'middle' });
        c.fit(page, person.years, { font: 'literata-italic', size: 7, leading: 1, color: MUTED, align: 'center' }, { x: x + mm(1.5), y: y + mm(10.5), w: plaque.w - mm(3), h: mm(3.5) }, { minSize: 5, maxLines: 1 });
        x += plaque.w + plaque.gap;
      }
      y += plaque.h + plaque.gap;
    }
    previousBottom = y - plaque.gap + mm(1);
    y += mm(5);
  }
}

function treePage(c: Composer, first: boolean): Page {
  const page = newPage(c, 'tree');
  if (first) {
    c.fit(page, 'Древо рода', styles.chapter, { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(18) }, { minSize: 22, maxLines: 1 });
    c.fit(page, 'Слева — по отцу, справа — по матери', { ...styles.italic, align: 'center' }, { x: MARGIN, y: TOP + mm(19), w: CONTENT.w, h: mm(6) }, { minSize: 7, maxLines: 1 });
  }
  return page;
}

function lineOrder(line: string): number {
  return line === 'paternal' ? 0 : line === 'maternal' ? 2 : 1;
}

function memberEntry(c: Composer, flow: BlockFlow, person: Member, field: ReturnType<Composer['materials']['field']>) {
  const photos = person.photos.filter((p) => !c.isUsed(p)).slice(0, 2);
  const meta = [person.years, person.line ? optionLabel(field, 'line', person.line) : ''].filter(Boolean).join(' · ');
  const flowables: Flowable[] = [
    { text: person.name, style: styles.name, keepWithNext: true, spaceBefore: 18 },
    ...(meta ? [{ text: meta, style: styles.italic, keepWithNext: true, spaceBefore: 2 }] : []),
    ...paragraphs(person.bio).map((p, i) => ({ text: p, style: styles.body, spaceBefore: i === 0 ? 6 : 0 })),
  ];
  flow.text(flowables);
  if (photos.length > 0) photoRow(c, flow, photos);
}

/** A row of archive-style photos with a paper mat. */
function photoRow(c: Composer, flow: BlockFlow, photos: PhotoRef[]) {
  const h = mm(58);
  flow.space(mm(4));
  flow.block(h + mm(4), (page, y) => {
    const gap = mm(5);
    const widths = photos.map((p) => Math.min(CONTENT.w, (h * p.width) / p.height));
    const total = widths.reduce((a, b) => a + b, 0) + gap * (photos.length - 1);
    const scale = total > CONTENT.w ? CONTENT.w / total : 1;
    let x = MARGIN + (CONTENT.w - total * scale) / 2;
    photos.forEach((photo, i) => {
      const w = widths[i]! * scale;
      const box = { x, y, w, h: h * scale };
      c.rect(page, { x: box.x - mm(1.5), y: box.y - mm(1.5), w: box.w + mm(3), h: box.h + mm(3) }, '#ffffff', { stroke: { color: '#d8ccb8', width: 0.5 } });
      c.image(page, photo, box);
      x += w + gap * scale;
    });
  });
}

function archivePage(c: Composer, photos: PhotoRef[]) {
  const page = newPage(c, 'archive');
  c.fit(page, 'Из семейного архива', { ...styles.label, align: 'center' }, { x: MARGIN, y: TOP - mm(8), w: CONTENT.w, h: mm(5) }, { minSize: 6, maxLines: 1 });
  const rows = photos.length <= 2 ? photos.length : 2;
  const cols = photos.length <= 2 ? 1 : 2;
  const gap = mm(8);
  const cellW = (CONTENT.w - gap * (cols - 1)) / cols;
  const cellH = (CONTENT.h - mm(4) - gap * (rows - 1)) / rows;
  photos.forEach((photo, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cell = { x: MARGIN + col * (cellW + gap), y: TOP + row * (cellH + gap), w: cellW, h: cellH };
    // Contain, not crop: archive photos are documents.
    const scale = Math.min((cell.w - mm(6)) / photo.width, (cell.h - mm(6)) / photo.height);
    const w = photo.width * scale;
    const h = photo.height * scale;
    const box = { x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - h) / 2, w, h };
    c.rect(page, { x: box.x - mm(2), y: box.y - mm(2), w: box.w + mm(4), h: box.h + mm(4) }, '#ffffff', { stroke: { color: '#d8ccb8', width: 0.5 } });
    c.image(page, photo, box);
  });
}

function notesPage(c: Composer) {
  const page = newPage(c, 'notes');
  c.fit(page, 'Для потомков', { ...styles.chapter, size: 28 }, { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(14) }, { minSize: 18, maxLines: 1 });
  c.fit(page, 'Допишите сюда то, что вспомнится позже: имена, даты, истории.', { ...styles.italic, align: 'center' }, { x: MARGIN, y: TOP + mm(16), w: CONTENT.w, h: mm(6) }, { minSize: 7, maxLines: 1 });
  for (let y = TOP + mm(36); y < A4.h - BOTTOM - mm(4); y += mm(11)) c.line(page, { x: MARGIN, y }, { x: A4.w - MARGIN, y }, '#d8ccb8', 0.5);
}

function colophon(c: Composer, family: string) {
  const page = c.addPage('colophon', A4, INDIGO);
  page.elements.push({ type: 'path', d: diamond(A4.w / 2, mm(120), mm(6)), fill: GOLD });
  c.fit(page, `Книгу рода ${family} собрала семья вместе со студией «Шежіре».`, { font: 'cormorant-italic', size: 18, leading: 1.4, color: PAPER, align: 'center' }, { x: MARGIN + mm(20), y: mm(134), w: CONTENT.w - mm(40), h: mm(40) }, { minSize: 11, maxLines: 4 });
  c.fit(page, `${new Date().getFullYear()} · shezhire.kz`, { ...styles.label, color: GOLD, align: 'center' }, { x: MARGIN, y: A4.h - mm(40), w: CONTENT.w, h: mm(5) }, { minSize: 6, maxLines: 1 });
}
