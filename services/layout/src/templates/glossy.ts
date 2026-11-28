import { A4, BLEED, mm, type Box, type Page, type PhotoRef, type TextStyle } from '../domain/document';
import { asPhotos, asText } from '../domain/materials';
import type { Flowable, FontMetrics } from '../domain/text';
import { backCover, coverPage, type CoverLine } from './glossy-covers';
import {
  BOTTOM,
  CONTENT,
  folio,
  FULL_BLEED,
  GUTTER,
  kicker,
  MARGIN,
  plural,
  rubric,
  shade,
  styles,
  TOP,
  type Issue,
  type Styles,
} from './glossy-kit';
import { themeFor } from './glossy-themes';
import {
  columns,
  Composer,
  editorialSections,
  formatDate,
  paragraphs,
  photoGrid,
  roundToSignature,
  splitLabel,
  type Template,
  type TemplateInput,
} from './template';

/**
 * Cover Me: an A4 glossy magazine of 24 or 36 pages about one hero, in one of four styles
 * (Глянец, Таблоид, Нежность, Нуар — see glossy-themes.ts).
 *
 * Rubrics, in reading order (each appears only when there is material for it):
 *   cover · contents · editor's letter with credits · dossier · big interview (photo opener + text)
 *   · tastes · timeline · in numbers · horoscope · then and now · rules of life · friends' insights
 *   · in one word · friends' essay · photo story with quotes · guest book · back cover
 *
 * Structured rubrics are set straight from the answers; the AI draft supplies the prose
 * (interview, letter, cover lines) and the art direction: personal rubric titles, the cover
 * tagline and the horoscope. With the offline template generator the interview is set as Q&A.
 */

const PAGE_COUNTS: Record<string, number> = { 'a4-24': 24, 'a4-36': 36 };
const MONTHS_NOMINATIVE = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const DEFAULT_TAGLINE = 'Специальный выпуск о человеке, которого мы любим';

export const glossyTemplate: Template = {
  id: 'glossy-magazine@4',

  // Cover candidates: the person is traced on them for the cut-out head over the masthead.
  portraits: (materials) => materials.photos('photos', 'cover'),

  build(input: TemplateInput, metrics: FontMetrics) {
    const target = PAGE_COUNTS[input.source.formatId] ?? 24;
    // Long texts are set slightly smaller rather than spilling over the format's page count.
    let result = buildMagazine(input, metrics, target, 1, false);
    for (const scale of [0.93, 0.87]) {
      if (result.corePages <= target) break;
      result = buildMagazine(input, metrics, target, scale, false);
    }
    // 36 pages promise every friend a page of their own; a short 24-page issue gets them too when
    // materials run short. Kept only when the issue still fits its format.
    const friendsCount = input.source.contributions.length;
    const preferSpacious = target >= 36 && friendsCount > 0 && friendsCount <= 10;
    if (friendsCount > 0 && (preferSpacious || result.spareGuestPages > 0)) {
      const spacious = buildMagazine(input, metrics, target, 1, true);
      if (spacious.composer.pages.length <= target) result = spacious;
    }
    const { composer } = result;
    if (!PAGE_COUNTS[input.source.formatId]) composer.warn(`Неизвестный формат «${input.source.formatId}», свёрстано на 24 страницы`);
    if (composer.pages.length > target) {
      composer.warn(`Материалов больше, чем помещается в ${target} страниц: макет занял ${composer.pages.length}. Проверьте, не нужно ли сократить текст.`);
    }
    return composer.document(result.title, glossyTemplate.id);
  },
};

interface ContentsEntry {
  title: string;
  note: string;
  page: number;
}

function buildMagazine(input: TemplateInput, metrics: FontMetrics, target: number, scale: number, spacious: boolean) {
  const c = new Composer(input, metrics);
  const m = c.materials;
  const hero = m.text('hero', 'heroName') || input.source.subject;
  const issue: Issue = {
    hero,
    occasion: m.optionLabel('hero', 'occasion'),
    eventDate: m.text('hero', 'eventDate'),
    month: issueMonth(m.text('hero', 'eventDate')),
    templateDraft: input.draft.generator === 'template',
    art: input.draft.art,
  };
  const title = issue.templateDraft ? templateTitle(hero, m.text('interview', 'threeWords')) : input.draft.title;

  // Photo pools.
  const coverPhotos = c.resolve(m.photos('photos', 'cover'));
  const gallery = c.resolve(m.photos('photos', 'gallery'));
  const childhood = c.resolve(m.photos('photos', 'childhood'));
  const owner = [...coverPhotos, ...gallery];
  const portraits = owner.filter((p) => p.height > p.width * 1.05);
  // The first cover photo with a clear person wins: it can stand in front of the masthead.
  const coverPhoto = coverPhotos.find((p) => p.silhouette) ?? coverPhotos[0] ?? portraits[0] ?? owner[0];
  if (!coverPhoto) c.warn('Нет ни одного фото для обложки: обложка свёрстана без портрета');
  const nextPortrait = () => portraits.find((p) => !c.isUsed(p)) ?? owner.find((p) => !c.isUsed(p));
  const nextPhoto = () => gallery.find((p) => !c.isUsed(p)) ?? owner.find((p) => !c.isUsed(p));

  // The style the customer chose, with the accent taken from the cover photo.
  const s = styles(themeFor(m.text('hero', 'tone'), coverPhoto?.vivid), scale);
  const t = s.t;

  const contents: ContentsEntry[] = [];
  const mark = (title: string, note: string) => contents.push({ title, note, page: c.pages.length + 1 });

  // 1. Cover
  coverPage(c, s, issue, coverPhoto, coverLines(input, c, issue), issue.art?.tagline.trim() || DEFAULT_TAGLINE);

  // 2–3. Contents and letter (contents are filled in at the end, when page numbers are known)
  const contentsPage = c.addPage('contents', A4, t.paper);
  const contentsPhoto = nextPhoto();
  if (contentsPhoto) c.image(contentsPage, contentsPhoto, { x: A4.w * 0.56, y: -BLEED, w: A4.w * 0.44 + BLEED, h: A4.h + 2 * BLEED });
  letterPage(c, s, issue, title, coverPhoto);

  // 4. Dossier
  if (hasDossier(c)) {
    const r = rubric(issue, 'dossier', { title: issue.hero, deck: 'Всё, что нужно знать о герое номера' });
    mark('Досье', r.deck);
    dossierPage(c, s, issue, r, nextPortrait());
  }

  // 5. Big interview
  const interview = interviewSection(input, c);
  if (interview) {
    const r = rubric(issue, 'interview', { title: interview.heading, deck: m.text('interview', 'threeWords') });
    mark('Большое интервью', r.deck || 'История героя номера');
    interviewPages(c, s, issue, interview, r, nextPhoto(), nextPhoto);
  }

  // 6. Tastes
  const tastes = favorites(c);
  if (tastes.length >= 3) {
    const r = rubric(issue, 'tastes', { title: `Что любит ${issue.hero}`, deck: `Без чего ${issue.hero} не представляет свою жизнь` });
    mark(r.title, 'Еда, музыка, места и коронная фраза');
    favoritesPage(c, s, issue, r, tastes);
  }

  // 7. Timeline
  const events = timeline(c);
  if (events.length >= 2) {
    const r = rubric(issue, 'timeline', { title: 'Жизнь в датах', deck: `${events[0]!.year} — ${events.at(-1)!.year}` });
    mark(r.title, 'Хронология');
    timelinePages(c, s, issue, r, events);
  }

  // 8. In numbers
  const facts = m
    .list('numbers', 'facts')
    .map((f) => ({ value: asText(f.value), label: asText(f.label) }))
    .filter((f) => f.value && f.label);
  if (facts.length >= 2) {
    const r = rubric(issue, 'numbers', { title: `${issue.hero} в цифрах` });
    mark(r.title, `${facts.length} ${plural(facts.length, ['факт', 'факта', 'фактов'])} о герое`);
    numbersPage(c, s, issue, r, facts);
  }

  // 9. Horoscope (AI art direction only)
  const sign = zodiac(m.text('hero', 'birthday'));
  const horoscope = issue.art?.horoscope.trim() ?? '';
  if (horoscope && sign) {
    const r = rubric(issue, 'horoscope', { title: sign.name });
    mark('Гороскоп номера', `${sign.name}: что звёзды говорят о герое`);
    horoscopePage(c, s, issue, r, sign, horoscope);
  }

  // 10. Then and now
  const kid = childhood[0];
  if (kid) {
    const r = rubric(issue, 'thenNow', { title: 'Тогда и сейчас' });
    mark(r.title, 'Из семейного альбома');
    thenAndNowPage(c, s, issue, r, kid, nextPortrait() ?? coverPhoto, m.text('interview', 'childhood'));
  }

  // 11. Rules of life
  const rules = m.list('rules', 'rules').map((x) => asText(x.text)).filter(Boolean);
  if (rules.length > 0) {
    const r = rubric(issue, 'rules', { title: 'Правила жизни', deck: m.text('hero', 'profession') });
    mark(r.title, `${rules.length} ${plural(rules.length, ['правило', 'правила', 'правил'])} героя`);
    rulesPages(c, s, issue, r, rules, nextPortrait());
  }

  // 12. Friends
  const friends = friendEntries(c);
  if (friends.length > 0) {
    const r = rubric(issue, 'friends', { title: 'Говорят друзья' });
    mark(r.title, `${friends.length} ${plural(friends.length, ['история', 'истории', 'историй'])} из первых уст`);
    if (spacious) friends.forEach((friend) => friendFeaturePage(c, s, issue, friend));
    else friendsPages(c, s, issue, r, friends);
    const words = friends.map((f) => ({ word: f.oneWord, author: f.author })).filter((w) => w.word);
    if (words.length >= 2) oneWordPage(c, s, issue, rubric(issue, 'words', { title: `${issue.hero} одним словом` }), words);
  }

  // 13. Friends' essay (AI drafts only)
  const essay = essaySection(input);
  if (essay) {
    mark(essay.heading, 'Портрет, собранный из историй друзей');
    essayPages(c, s, issue, essay, nextPhoto());
  }

  const corePages = c.pages.length + 1; // + back cover

  // 14. Photo story, quotes and the guest book fill the format up to its page count.
  const quotes = friends.filter((f) => f.wish).map((f) => ({ text: f.wish, author: f.author }));
  const total = Math.max(target, roundToSignature(corePages + 1));
  const remaining = [...owner, ...childhood, ...friends.flatMap((f) => f.photos)].filter((p) => !c.isUsed(p));
  const guestPages = target >= 36 ? 2 : 1;
  const free = Math.max(0, total - corePages - guestPages);
  const photosRubric = rubric(issue, 'photos', { title: 'Лучшие кадры' });
  if (free > 0 && remaining.length > 0) mark(photosRubric.title, 'Фотосессия');
  photoStory(c, s, issue, photosRubric, remaining, quotes, free);
  // The rest: guest book pages, with any wishes not used yet set between them.
  const before = c.pages.length;
  let guestBookCount = 0;
  while (c.pages.length + 1 < total) {
    if (guestBookCount > 0 && quotes.length > 0 && c.pages.length + 2 < total) quotePage(c, s, quotes.shift()!, c.pages.length % 2 === 0);
    guestBookPage(c, s, issue, guestBookCount++ === 0);
  }
  if (guestBookCount > 0) contents.push({ title: 'Пожелания гостей', note: 'Страницы для автографов на празднике', page: before + 1 });
  if (guestBookCount > guestPages) {
    c.warn(`Материалов мало: ${guestBookCount} страниц отданы под пожелания гостей. Стоит попросить у клиента ещё фото, событий для хронологии или историй друзей.`);
  }

  // 15. Back cover
  backCover(c, s, issue, m.text('favorites', 'phrase'), input.draft.cards.at(-1)?.title, input.source.issueUrl);

  fillContents(c, s, contentsPage, issue, contents);
  return { composer: c, corePages, title, spareGuestPages: Math.max(0, guestBookCount - guestPages) };
}

// ---------- Rubrics ----------

function letterPage(c: Composer, s: Styles, issue: Issue, title: string, portrait: PhotoRef | undefined) {
  const t = s.t;
  const page = c.addPage('letter', A4, t.paper);
  kicker(c, s, page, 'Письмо редактора', { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) });
  const headUsed = c.fit(page, title, { ...s.headline, size: 40 }, { x: MARGIN, y: TOP + mm(9), w: mm(150), h: mm(56) }, { minSize: 24, maxLines: 4 });
  let y = TOP + mm(9) + headUsed + mm(10);
  const lead = issue.templateDraft ? templateLetter(c, issue) : c.input.draft.lead;
  const leadBox = { x: MARGIN, y, w: mm(112), h: mm(120) };
  const { used } = c.text(page, paragraphs(lead).map((p) => ({ text: p, style: { ...s.lede, size: s.lede.size * 1.15, leading: 1.45 } })), leadBox);
  y += used + mm(8);
  c.fit(page, 'С любовью,', { ...s.deck, size: 13 }, { x: MARGIN, y, w: mm(80), h: mm(7) }, { minSize: 9, maxLines: 1 });
  c.fit(page, 'редакция Cover Me', { font: t.fonts.displayItalic, size: 20, leading: 1.1, color: t.accent }, { x: MARGIN, y: y + mm(7), w: mm(90), h: mm(10) }, { minSize: 12, maxLines: 1 });

  // Side column: the hero in a circle.
  const side = { x: MARGIN + mm(122), w: CONTENT.w - mm(122) };
  const sy = TOP + mm(9) + headUsed + mm(10);
  if (portrait) c.image(page, portrait, { x: side.x, y: sy, w: side.w, h: side.w }, { shape: 'circle', focusY: 0.25 });
  // Impressum at the foot of the page, like a real masthead.
  const credits = c.input.source.contributions.map((x) => x.authorName);
  const impY = A4.h - BOTTOM - mm(34);
  c.line(page, { x: MARGIN, y: impY }, { x: A4.w - MARGIN, y: impY }, t.ink, 0.8);
  const cols = columns({ x: MARGIN, y: impY + mm(5), w: CONTENT.w, h: mm(28) }, 3, GUTTER);
  const blocks: Array<[string, string]> = [
    ['Герой номера', issue.hero],
    ['Над номером работали', credits.length > 0 ? credits.slice(0, 10).join(', ') : 'Редакция Cover Me'],
    ['Выпуск', [`№ 01, ${issue.month.toLowerCase()}`, issue.occasion].filter(Boolean).join(' · ')],
  ];
  blocks.forEach(([label, value], i) => {
    c.fit(page, label, s.label, { ...cols[i]!, h: mm(4) }, { minSize: 5, maxLines: 1 });
    c.fit(page, value, { font: t.fonts.sans, size: 8.5, leading: 1.35, color: t.ink }, { ...cols[i]!, y: cols[i]!.y + mm(5.5), h: mm(22) }, { minSize: 6.5, maxLines: 5 });
  });
  folio(c, s, page, issue);
}

function fillContents(c: Composer, s: Styles, page: Page, issue: Issue, entries: ContentsEntry[]) {
  const t = s.t;
  const width = A4.w * 0.56 - MARGIN - mm(8);
  kicker(c, s, page, 'В номере', { x: MARGIN, y: TOP, w: width, h: mm(5) });
  c.fit(page, 'Содержание', { ...s.headline, size: 50 }, { x: MARGIN, y: TOP + mm(8), w: width, h: mm(22) }, { minSize: 28, maxLines: 1 });
  const list = entries.slice(0, 12);
  const step = Math.min(mm(21), (A4.h - BOTTOM - mm(10) - (TOP + mm(40))) / Math.max(1, list.length));
  let y = TOP + mm(40);
  for (const entry of list) {
    c.fit(page, String(entry.page).padStart(2, '0'), { font: t.fonts.numeral, size: 28, leading: 1, color: t.accent }, { x: MARGIN, y, w: mm(18), h: mm(11) }, { minSize: 16, maxLines: 1 });
    const used = c.fit(page, entry.title, { font: t.fonts.serifBold, size: 14, leading: 1.1, color: t.ink, uppercase: t.headlineUppercase }, { x: MARGIN + mm(20), y: y + mm(0.5), w: width - mm(20), h: mm(7) }, { minSize: 9, maxLines: 1 });
    c.fit(page, entry.note, { font: t.fonts.sans, size: 8, leading: 1.3, color: t.muted }, { x: MARGIN + mm(20), y: y + used + mm(1.5), w: width - mm(20), h: mm(5) }, { minSize: 6, maxLines: 1 });
    c.line(page, { x: MARGIN, y: y + step - mm(3) }, { x: MARGIN + width, y: y + step - mm(3) }, t.hairline, 0.5);
    y += step;
  }
  folio(c, s, page, issue, 2);
}

function hasDossier(c: Composer): boolean {
  const m = c.materials;
  return ['birthday', 'profession', 'city'].some((f) => m.text('hero', f)) || Boolean(m.text('interview', 'threeWords'));
}

function dossierPage(c: Composer, s: Styles, issue: Issue, r: { title: string; deck: string }, portrait: PhotoRef | undefined) {
  const t = s.t;
  const m = c.materials;
  const page = c.addPage('dossier', A4, t.soft);
  let x = MARGIN;
  if (portrait && t.portraitShape === 'circle') {
    // Tender: a large round portrait at the top, the file below it.
    const d = mm(96);
    c.image(page, portrait, { x: (A4.w - d) / 2, y: TOP, w: d, h: d }, { shape: 'circle', focusY: 0.25 });
    c.rect(page, { x: (A4.w - d) / 2 - mm(3), y: TOP - mm(3), w: d + mm(6), h: d + mm(6) }, undefined, { stroke: { color: t.accent, width: 0.6 }, radius: (d + mm(6)) / 2 });
  } else if (portrait) {
    const split = A4.w * 0.46;
    c.image(page, portrait, { x: -BLEED, y: -BLEED, w: split + BLEED, h: A4.h + 2 * BLEED }, { focusY: 0.25 });
    x = split + mm(10);
  }
  const round = Boolean(portrait) && t.portraitShape === 'circle';
  const top = round ? TOP + mm(108) : TOP;
  const w = A4.w - x - MARGIN;
  kicker(c, s, page, 'Досье', { x, y: top, w, h: mm(5) });
  const used = c.fit(page, r.title, { ...s.headline, size: round ? 40 : 46 }, { x, y: top + mm(8), w, h: mm(round ? 20 : 36) }, { minSize: 22, maxLines: round ? 1 : 2 });
  let y = top + mm(14) + used;

  const birthday = m.text('hero', 'birthday');
  const rows: Array<[string, string]> = [
    ['Дата рождения', birthday ? formatDate(birthday) : ''],
    ['Знак зодиака', zodiac(birthday)?.name ?? ''],
    ['Город', m.text('hero', 'city')],
    ['Чем занимается', m.text('hero', 'profession')],
    ['Повод номера', [issue.occasion, issue.eventDate ? formatDate(issue.eventDate) : ''].filter(Boolean).join(', ')],
    ['В трёх словах', m.text('interview', 'threeWords')],
    ['Мечтает', m.text('interview', 'dream')],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  // Two columns of facts under a round portrait, one column beside a tall one.
  const colCount = round ? 2 : 1;
  const colW = (w - GUTTER * (colCount - 1)) / colCount;
  const startY = y;
  rows.forEach(([label, value], i) => {
    const col = round ? i % 2 : 0;
    const cx = x + col * (colW + GUTTER);
    const rowY = round ? startY + Math.floor(i / 2) * mm(19) : y;
    if (rowY > A4.h - BOTTOM - mm(14)) return;
    c.line(page, { x: cx, y: rowY }, { x: cx + colW, y: rowY }, t.accent, 0.6);
    c.fit(page, label, s.label, { x: cx, y: rowY + mm(3), w: colW, h: mm(4) }, { minSize: 5, maxLines: 1 });
    const h = c.fit(page, value, s.value, { x: cx, y: rowY + mm(8), w: colW, h: round ? mm(10) : mm(20) }, { minSize: 9, maxLines: round ? 1 : 3 });
    if (!round) y += h + mm(12);
  });
  folio(c, s, page, issue);
}

function interviewSection(input: TemplateInput, c: Composer): { heading: string; body: string } | undefined {
  const sections = editorialSections(input, ['hero', 'photos', 'rules', 'favorites', 'timeline', 'numbers']);
  if (input.draft.generator === 'template') {
    const title = c.materials.stepTitle('interview')?.trim().toLowerCase();
    return sections.find((x) => x.heading.trim().toLowerCase() === title);
  }
  return sections.find((x) => /интервью/i.test(x.heading)) ?? sections.find((x) => !/друз|правил|хронолог/i.test(x.heading));
}

function essaySection(input: TemplateInput): { heading: string; body: string } | undefined {
  if (input.draft.generator === 'template') return undefined;
  return editorialSections(input, []).find((x) => /друз/i.test(x.heading) && !/инсайд/i.test(x.heading));
}

function interviewPages(
  c: Composer,
  s: Styles,
  issue: Issue,
  section: { heading: string; body: string },
  r: { title: string; deck: string },
  opener: PhotoRef | undefined,
  spare: () => PhotoRef | undefined,
) {
  const t = s.t;
  // Opener: full-bleed photo with the headline set over it.
  if (opener) {
    const page = c.addPage('article', A4, t.shadow);
    c.image(page, opener, FULL_BLEED);
    shade(c, s, page, A4.h - mm(130), A4.h + BLEED, 0.7, 'up');
    kicker(c, s, page, 'Большое интервью', { x: MARGIN, y: A4.h - mm(96), w: CONTENT.w, h: mm(5) }, t.kicker === 'bar' ? undefined : t.onPhoto);
    const used = c.fit(page, issue.hero, { ...s.headline, size: 80, color: t.onPhoto }, { x: MARGIN, y: A4.h - mm(88), w: CONTENT.w, h: mm(40) }, { minSize: 36, maxLines: 2 });
    if (r.deck) c.fit(page, r.deck, { ...s.deck, size: 18, color: t.onPhoto }, { x: MARGIN, y: A4.h - mm(84) + used, w: mm(140), h: mm(24) }, { minSize: 11, maxLines: 2 });
  }

  // Text pages: lede, Q&A or prose in two columns, a pull quote in the second column.
  const flowables = articleFlowables(section, s, issue.templateDraft);
  const pullText = pullQuote(c, section);
  const colW = (CONTENT.w - GUTTER) / 2;
  const story = c.story(flowables, colW);
  let first = true;
  while (!story.done) {
    const page = c.addPage('article', A4, t.paper);
    let top = TOP;
    if (first) {
      kicker(c, s, page, 'Большое интервью', { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) });
      const used = c.fit(page, opener ? r.title : issue.hero, { ...s.headline, size: 40 }, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(30) }, { minSize: 22, maxLines: 2 });
      c.rect(page, { x: MARGIN, y: TOP + mm(11) + used, w: mm(24), h: 2 }, t.accent);
      top = TOP + mm(18) + used;
    }
    let [left, right] = columns({ x: MARGIN, y: top, w: CONTENT.w, h: A4.h - BOTTOM - top }, 2, GUTTER) as [Box, Box];
    // A short interview leaves the page half empty: give its lower part to a photo.
    if (first && story.remainingHeight < (left.h + right.h) * 0.5) {
      const band = Math.min(mm(110), left.h - story.remainingHeight / 2 - mm(70));
      const photo = band > mm(60) ? spare() : undefined;
      if (photo) {
        c.image(page, photo, { x: -BLEED, y: A4.h - band, w: A4.w + 2 * BLEED, h: band + BLEED });
        left = { ...left, h: left.h - band - mm(6) + BOTTOM };
        right = { ...right, h: right.h - band - mm(6) + BOTTOM };
      }
    }
    const frames = [left, right];
    if (first && pullText) {
      const quoteH = mm(52);
      frames[1] = { ...right, h: right.h - quoteH - mm(4) };
      const qy = right.y + right.h - quoteH;
      c.rect(page, { x: right.x, y: qy, w: right.w, h: 2 }, t.accent);
      c.fit(page, `«${pullText}»`, { ...s.pull, uppercase: t.cover === 'tabloid' }, { x: right.x, y: qy + mm(5), w: right.w, h: quoteH - mm(6) }, { minSize: 12, maxLines: 6 });
    }
    c.flow(page, story, frames);
    folio(c, s, page, issue);
    first = false;
  }
}

/** Prose with a lede; "Question: answer" lines become Q&A only in drafts of the template generator. */
function articleFlowables(section: { heading: string; body: string }, s: Styles, qa: boolean): Flowable[] {
  const items = paragraphs(section.body);
  return items.flatMap((p, i): Flowable[] => {
    const pair = qa ? splitLabel(p) : null;
    if (pair) return [{ text: pair.label, style: s.question, keepWithNext: true, spaceBefore: i === 0 ? 0 : 7 }, { text: pair.value, style: s.body }];
    if (i === 0) return [{ text: p, style: s.lede }];
    return [{ text: p, style: s.body }];
  });
}

function pullQuote(c: Composer, section: { body: string }): string | undefined {
  const m = c.materials;
  const candidates = [m.text('interview', 'lesson'), m.text('favorites', 'phrase'), m.text('interview', 'dream')];
  const own = candidates.find((x) => x && x.length <= 160);
  if (own) return own.replace(/^[«"]|[»"]$/g, '');
  const sentence = paragraphs(section.body)
    .map((p) => (c.input.draft.generator === 'template' ? (splitLabel(p)?.value ?? p) : p))
    .flatMap((p) => p.split(/(?<=[.!?])\s+/))
    .find((x) => x.length >= 40 && x.length <= 140);
  return sentence?.replace(/[.]$/, '');
}

function favorites(c: Composer): Array<{ label: string; value: string }> {
  const m = c.materials;
  const fields: Array<[string, string]> = [
    ['food', 'Еда'],
    ['drink', 'Напиток'],
    ['music', 'Музыка'],
    ['film', 'Кино'],
    ['place', 'Место'],
    ['phrase', 'Коронная фраза'],
  ];
  return fields.map(([id, label]) => ({ label, value: m.text('favorites', id) })).filter((f) => f.value);
}

function favoritesPage(c: Composer, s: Styles, issue: Issue, r: { title: string; deck: string }, items: Array<{ label: string; value: string }>) {
  const t = s.t;
  const page = c.addPage('tastes', A4, t.panel);
  kicker(c, s, page, 'Рубрика', { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) });
  const used = c.fit(page, r.title, s.headline, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(40) }, { minSize: 26, maxLines: 2 });
  const deckUsed = c.fit(page, r.deck, s.deck, { x: MARGIN, y: TOP + mm(11) + used, w: CONTENT.w, h: mm(14) }, { minSize: 10, maxLines: 2 });

  const top = TOP + mm(22) + used + deckUsed;
  const rows = Math.ceil(items.length / 2);
  const cellW = (CONTENT.w - GUTTER) / 2;
  const cellH = Math.min(mm(62), (A4.h - BOTTOM - top - GUTTER * (rows - 1)) / rows);
  items.forEach((item, i) => {
    const x = MARGIN + (i % 2) * (cellW + GUTTER);
    const y = top + Math.floor(i / 2) * (cellH + GUTTER);
    c.rect(page, { x, y, w: cellW, h: cellH }, t.card, t.cover === 'tabloid' ? { stroke: { color: t.ink, width: 1.5 } } : {});
    page.elements.push({ type: 'ellipse', cx: x + mm(12), cy: y + mm(12), rx: mm(5), ry: mm(5), fill: t.accent });
    c.fit(page, String(i + 1), { font: t.fonts.numeral, size: 12, leading: 1, color: t.onAccent, align: 'center' }, { x: x + mm(7), y: y + mm(9.2), w: mm(10), h: mm(6) }, { minSize: 8, maxLines: 1 });
    c.fit(page, item.label, s.label, { x: x + mm(20), y: y + mm(10.4), w: cellW - mm(26), h: mm(4) }, { minSize: 5, maxLines: 1 });
    c.fit(page, item.value, { font: t.fonts.serifItalic, size: 24, leading: 1.15, color: t.ink, uppercase: t.cover === 'tabloid' }, { x: x + mm(7), y: y + mm(24), w: cellW - mm(14), h: cellH - mm(30) }, { minSize: 12, maxLines: 4, verticalAlign: 'top' });
  });
  folio(c, s, page, issue);
}

function timeline(c: Composer): Array<{ year: string; title: string; photo?: PhotoRef }> {
  return c.materials
    .list('timeline', 'events')
    .map((e) => ({ year: asText(e.year), title: asText(e.title), photo: c.resolve(asPhotos(e.photo))[0] }))
    .filter((e) => e.year && e.title)
    .sort((a, b) => (parseInt(a.year, 10) || 0) - (parseInt(b.year, 10) || 0));
}

function timelinePages(c: Composer, s: Styles, issue: Issue, r: { title: string; deck: string }, events: Array<{ year: string; title: string; photo?: PhotoRef }>) {
  const t = s.t;
  const axis = MARGIN + mm(38);
  let page: Page | undefined;
  let y = 0;
  const open = (first: boolean) => {
    page = c.addPage('timeline', A4, t.paper);
    let top = TOP;
    if (first) {
      kicker(c, s, page, 'Хронология', { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) });
      const used = c.fit(page, r.title, s.headline, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(40) }, { minSize: 26, maxLines: 2 });
      const deckUsed = c.fit(page, r.deck, s.deck, { x: MARGIN, y: TOP + mm(11) + used, w: CONTENT.w, h: mm(10) }, { minSize: 10, maxLines: 1 });
      top = TOP + mm(22) + used + deckUsed;
    }
    c.line(page, { x: axis, y: top }, { x: axis, y: A4.h - BOTTOM }, t.accent, 1.2);
    y = top + mm(2);
  };
  open(true);
  for (const event of events) {
    const rowH = event.photo ? mm(44) : mm(24);
    if (y + rowH > A4.h - BOTTOM) {
      folio(c, s, page!, issue);
      open(false);
    }
    const p = page!;
    c.fit(p, event.year, { font: t.fonts.numeral, size: 30, leading: 1, color: t.ink, align: 'right' }, { x: MARGIN, y, w: axis - MARGIN - mm(7), h: mm(12) }, { minSize: 14, maxLines: 1 });
    p.elements.push({ type: 'ellipse', cx: axis, cy: y + mm(5), rx: mm(2.2), ry: mm(2.2), fill: t.accent });
    const textX = axis + mm(8);
    const textW = event.photo ? mm(70) : A4.w - MARGIN - textX;
    c.fit(p, event.title, { font: t.fonts.serif, size: s.lede.size * 1.15, leading: 1.3, color: t.ink }, { x: textX, y: y + mm(1), w: textW, h: rowH - mm(6) }, { minSize: 10, maxLines: 5 });
    if (event.photo) c.image(p, event.photo, { x: A4.w - MARGIN - mm(52), y, w: mm(52), h: rowH - mm(6) });
    y += rowH;
  }
  folio(c, s, page!, issue);
}

function numbersPage(c: Composer, s: Styles, issue: Issue, r: { title: string; deck: string }, facts: Array<{ value: string; label: string }>) {
  const t = s.t;
  const page = c.addPage('numbers', A4, t.dark);
  kicker(c, s, page, 'Инфографика', { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) }, t.kicker === 'bar' ? '#000000' : t.darkAccent);
  const used = c.fit(page, r.title, { ...s.headline, color: t.onDark }, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(42) }, { minSize: 26, maxLines: 2 });
  const deckUsed = r.deck ? c.fit(page, r.deck, { ...s.deck, color: t.onDark }, { x: MARGIN, y: TOP + mm(11) + used, w: CONTENT.w, h: mm(12) }, { minSize: 10, maxLines: 2 }) : 0;
  const list = facts.slice(0, 8);
  const top = TOP + mm(22) + used + deckUsed;
  const rows = Math.ceil(list.length / 2);
  const cellW = (CONTENT.w - GUTTER * 2) / 2;
  const cellH = (A4.h - BOTTOM - top) / Math.max(rows, 2);
  list.forEach((fact, i) => {
    const x = MARGIN + (i % 2) * (cellW + GUTTER * 2);
    const y = top + Math.floor(i / 2) * cellH;
    c.line(page, { x, y }, { x: x + cellW, y }, t.darkRule, 0.6);
    const h = c.fit(page, fact.value, { font: t.fonts.numeral, size: 78, leading: 1, color: t.darkAccent }, { x, y: y + mm(4), w: cellW, h: cellH * 0.55 }, { minSize: 30, maxLines: 1 });
    c.fit(page, fact.label, { font: t.fonts.sansSemi, size: 11, leading: 1.3, color: t.onDark }, { x, y: y + mm(6) + h, w: cellW - mm(6), h: cellH - h - mm(10) }, { minSize: 7, maxLines: 3 });
  });
  folio(c, s, page, issue, undefined, t.darkRule);
}

/** A zodiac wheel with the hero's sign and the AI's playful forecast. */
function horoscopePage(c: Composer, s: Styles, issue: Issue, r: { title: string; deck: string }, sign: { name: string; dates: string; index: number }, text: string) {
  const t = s.t;
  const page = c.addPage('horoscope', A4, t.panel);
  kicker(c, s, page, 'Гороскоп номера', { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) });

  // The wheel: twelve segments, the hero's highlighted.
  const cx = A4.w / 2;
  const cy = TOP + mm(66);
  const outer = mm(52);
  const inner = mm(36);
  page.elements.push({ type: 'ellipse', cx, cy, rx: outer, ry: outer, stroke: { color: t.ink, width: 0.8 } });
  page.elements.push({ type: 'ellipse', cx, cy, rx: inner, ry: inner, stroke: { color: t.ink, width: 0.5 } });
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12 - Math.PI / 2;
    const a2 = (Math.PI * 2 * (i + 1)) / 12 - Math.PI / 2;
    if (i === sign.index) {
      const pt = (rad: number, ang: number) => `${(cx + rad * Math.cos(ang)).toFixed(2)} ${(cy + rad * Math.sin(ang)).toFixed(2)}`;
      page.elements.push({ type: 'path', d: `M${pt(inner, a)} L${pt(outer, a)} A${outer} ${outer} 0 0 1 ${pt(outer, a2)} L${pt(inner, a2)} A${inner} ${inner} 0 0 0 ${pt(inner, a)} Z`, fill: t.accent });
    }
    page.elements.push({ type: 'line', from: { x: cx + inner * Math.cos(a), y: cy + inner * Math.sin(a) }, to: { x: cx + outer * Math.cos(a), y: cy + outer * Math.sin(a) }, color: t.ink, width: 0.5 });
  }
  c.fit(page, sign.name, { font: t.fonts.displayItalic, size: 30, leading: 1, color: t.ink, align: 'center', uppercase: t.headlineUppercase }, { x: cx - inner + mm(4), y: cy - mm(7), w: inner * 2 - mm(8), h: mm(12) }, { minSize: 14, maxLines: 1 });
  c.fit(page, sign.dates, { ...s.label, align: 'center' }, { x: cx - inner, y: cy + mm(6), w: inner * 2, h: mm(4) }, { minSize: 5, maxLines: 1 });

  const top = cy + outer + mm(14);
  const used = c.fit(page, r.title === sign.name ? `Звёзды о ${issue.hero}` : r.title, { ...s.headline, size: 36, align: 'center' }, { x: MARGIN, y: top, w: CONTENT.w, h: mm(24) }, { minSize: 20, maxLines: 2 });
  c.text(page, paragraphs(text).map((p) => ({ text: p, style: { ...s.lede, align: 'center' as const } })), { x: MARGIN + mm(14), y: top + used + mm(8), w: CONTENT.w - mm(28), h: A4.h - BOTTOM - (top + used + mm(8)) });
  folio(c, s, page, issue);
}

function thenAndNowPage(c: Composer, s: Styles, issue: Issue, r: { title: string; deck: string }, then: PhotoRef, now: PhotoRef | undefined, story: string) {
  const t = s.t;
  const page = c.addPage('then-now', A4, t.paper);
  kicker(c, s, page, 'Из семейного альбома', { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) });
  const used = c.fit(page, r.title, s.headline, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(26) }, { minSize: 26, maxLines: 1 });
  const top = TOP + mm(16) + used;
  const photoH = mm(132);
  const w = (CONTENT.w - GUTTER) / 2;
  const boxes = [
    { photo: then, label: 'Тогда', x: MARGIN },
    { photo: now, label: 'Сейчас', x: MARGIN + w + GUTTER },
  ];
  for (const b of boxes) {
    if (!b.photo) continue;
    c.image(page, b.photo, { x: b.x, y: top, w, h: photoH }, { focusY: 0.3 });
    const tagBg = b.label === 'Тогда' ? t.ink : t.accent;
    c.rect(page, { x: b.x, y: top + photoH - mm(10), w: mm(26), h: mm(10) }, tagBg);
    c.fit(page, b.label, { font: t.fonts.displayItalic, size: 14, leading: 1, color: b.label === 'Тогда' ? t.paper : t.onAccent, align: 'center', uppercase: t.headlineUppercase }, { x: b.x, y: top + photoH - mm(7.6), w: mm(26), h: mm(7) }, { minSize: 9, maxLines: 1 });
  }
  if (story) {
    const textTop = top + photoH + mm(10);
    c.fit(page, `«${story.replace(/^[«"]|[»"]$/g, '')}»`, { font: t.fonts.serifItalic, size: s.deck.size * 1.15, leading: 1.35, color: t.ink }, { x: MARGIN, y: textTop, w: CONTENT.w * 0.8, h: A4.h - BOTTOM - textTop }, { minSize: 10, maxLines: 7 });
  }
  folio(c, s, page, issue);
}

function rulesPages(c: Composer, s: Styles, issue: Issue, r: { title: string; deck: string }, rules: string[], portrait: PhotoRef | undefined) {
  const t = s.t;
  const photoW = portrait ? A4.w * 0.36 : 0;
  const textW = A4.w - MARGIN - photoW - mm(10) - (portrait ? 0 : MARGIN - mm(10));
  const flowables = rules.flatMap((rule, i): Flowable[] => [
    { text: String(i + 1).padStart(2, '0'), style: { font: t.fonts.numeral, size: 22, leading: 1.05, color: t.accent }, keepWithNext: true, spaceBefore: i === 0 ? 0 : 11 },
    { text: rule, style: { font: t.fonts.serif, size: s.lede.size * 1.3, leading: 1.28, color: t.ink } },
  ]);
  const story = c.story(flowables, textW);
  let first = true;
  while (!story.done) {
    const page = c.addPage('rules', A4, t.paper);
    let top = TOP;
    if (first) {
      if (portrait) c.image(page, portrait, { x: A4.w - photoW, y: -BLEED, w: photoW + BLEED, h: A4.h + 2 * BLEED }, { focusY: 0.25 });
      kicker(c, s, page, issue.hero, { x: MARGIN, y: TOP, w: textW, h: mm(5) });
      const used = c.fit(page, r.title, { ...s.headline, size: 60 }, { x: MARGIN, y: TOP + mm(8), w: textW, h: mm(50) }, { minSize: 28, maxLines: 3 });
      const deckUsed = r.deck ? c.fit(page, r.deck, s.deck, { x: MARGIN, y: TOP + mm(11) + used, w: textW, h: mm(14) }, { minSize: 10, maxLines: 2 }) : 0;
      top = TOP + mm(22) + used + deckUsed;
    }
    c.flow(page, story, [{ x: MARGIN, y: top, w: textW, h: A4.h - BOTTOM - top }]);
    folio(c, s, page, issue);
    first = false;
  }
}

interface Friend {
  author: string;
  relation: string;
  story: string;
  wish: string;
  oneWord: string;
  photos: PhotoRef[];
}

function friendEntries(c: Composer): Friend[] {
  const step = c.input.product.steps.find((st) => st.audience === 'contributor');
  if (!step) return [];
  return c.input.source.contributions.map((contribution) => {
    const answers = contribution.answers[step.id] ?? {};
    return {
      author: contribution.authorName,
      relation: asText(answers.relation),
      story: asText(answers.story),
      wish: asText(answers.wish),
      oneWord: asText(answers.oneWord),
      photos: c.resolve(asPhotos(answers.photos)),
    };
  });
}

function friendsPages(c: Composer, s: Styles, issue: Issue, r: { title: string; deck: string }, friends: Friend[]) {
  const t = s.t;
  const colW = (CONTENT.w - GUTTER) / 2;
  const avatar = mm(16);
  let page: Page | undefined;
  let col = 0;
  let y = 0;
  let top = 0;
  const open = (first: boolean) => {
    page = c.addPage('friends', A4, t.paper);
    top = TOP;
    if (first) {
      kicker(c, s, page, 'Инсайды', { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) });
      const used = c.fit(page, r.title, s.headline, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(26) }, { minSize: 26, maxLines: 1 });
      const deckUsed = r.deck ? c.fit(page, r.deck, s.deck, { x: MARGIN, y: TOP + mm(11) + used, w: CONTENT.w, h: mm(9) }, { minSize: 10, maxLines: 1 }) : 0;
      top = TOP + mm(18) + used + deckUsed;
    }
    col = 0;
    y = top;
  };
  const nextColumn = () => {
    if (col === 0) {
      col = 1;
      y = top;
    } else {
      folio(c, s, page!, issue);
      open(false);
    }
  };

  const blockFlowables = (friend: Friend): Flowable[] => [
    ...paragraphs(friend.story).map((p) => ({ text: p, style: s.body })),
    ...(friend.wish ? [{ text: `«${friend.wish}»`, style: s.wish, spaceBefore: 4 }] : []),
  ];
  // Balance the columns when everything fits on the first page.
  const heights = friends.map((f) => mm(31) + c.measure(blockFlowables(f), colW));
  const total = heights.reduce((a, b) => a + b, 0);

  open(true);
  const available = A4.h - BOTTOM - top;
  let placedHeight = 0;
  friends.forEach((friend, index) => {
    if (col === 0 && placedHeight > 0 && total <= available * 2 && placedHeight + heights[index]! / 2 > total / 2) nextColumn();
    placedHeight += heights[index]!;
    const textX = () => MARGIN + col * (colW + GUTTER);
    // Header: avatar, name, relation. Keep it with at least a few lines of the story.
    if (A4.h - BOTTOM - y < mm(40)) nextColumn();
    const headerTop = y;
    const photo = friend.photos.find((p) => !c.isUsed(p));
    const nameX = photo ? textX() + avatar + mm(4) : textX();
    if (photo) c.image(page!, photo, { x: textX(), y: headerTop, w: avatar, h: avatar }, { shape: 'circle', focusY: 0.3 });
    const nameH = c.fit(page!, friend.author, s.author, { x: nameX, y: headerTop + mm(1), w: colW - (nameX - textX()), h: mm(12) }, { minSize: 10, maxLines: 2 });
    if (friend.relation) c.fit(page!, friend.relation, { ...s.label, color: t.accent }, { x: nameX, y: headerTop + nameH + mm(2), w: colW - (nameX - textX()), h: mm(4) }, { minSize: 5, maxLines: 1 });
    y = headerTop + Math.max(photo ? avatar : 0, nameH + mm(7)) + mm(4);

    const story = c.story(blockFlowables(friend), colW);
    while (!story.done) {
      const used = c.flow(page!, story, [{ x: textX(), y, w: colW, h: A4.h - BOTTOM - y }]);
      y += used;
      if (!story.done) nextColumn();
    }
    c.line(page!, { x: textX(), y: y + mm(5) }, { x: textX() + mm(14), y: y + mm(5) }, t.accent, 1.2);
    y += mm(11);
  });
  folio(c, s, page!, issue);
}

/** One friend, one page: a big photo, their story in large type and the wish as a pull quote. */
function friendFeaturePage(c: Composer, s: Styles, issue: Issue, friend: Friend) {
  const t = s.t;
  const page = c.addPage('friends', A4, t.paper);
  const photo = friend.photos.find((p) => !c.isUsed(p));
  let top = TOP;
  if (photo && t.portraitShape === 'circle') {
    const d = mm(110);
    c.image(page, photo, { x: (A4.w - d) / 2, y: TOP, w: d, h: d }, { shape: 'circle', focusY: 0.3 });
    top = TOP + d + mm(12);
  } else if (photo) {
    const h = mm(150);
    c.image(page, photo, { x: -BLEED, y: -BLEED, w: A4.w + 2 * BLEED, h: h + BLEED }, { focusY: 0.3 });
    top = h + mm(10);
  }
  kicker(c, s, page, friend.relation ? `Инсайд · ${friend.relation}` : 'Инсайд', { x: MARGIN, y: top, w: CONTENT.w, h: mm(5) });
  const used = c.fit(page, friend.author, { ...s.headline, size: photo ? 36 : 48 }, { x: MARGIN, y: top + mm(7), w: CONTENT.w, h: mm(26) }, { minSize: 20, maxLines: 2 });
  const textTop = top + mm(13) + used;
  const flowables: Flowable[] = [
    ...paragraphs(friend.story).map((p) => ({ text: p, style: { ...s.lede, size: s.lede.size * (photo ? 0.92 : 1.08) } })),
    ...(friend.wish ? [{ text: `«${friend.wish}»`, style: { ...s.pull, size: s.pull.size * (photo ? 0.75 : 1) }, spaceBefore: 6 }] : []),
  ];
  const story = c.story(flowables, CONTENT.w);
  c.flow(page, story, [{ x: MARGIN, y: textTop, w: CONTENT.w, h: A4.h - BOTTOM - textTop }]);
  folio(c, s, page, issue);
  // A very long story continues on the next page.
  while (!story.done) {
    const next = c.addPage('friends', A4, t.paper);
    c.flow(next, story, [CONTENT]);
    folio(c, s, next, issue);
  }
}

function oneWordPage(c: Composer, s: Styles, issue: Issue, r: { title: string; deck: string }, words: Array<{ word: string; author: string }>) {
  const t = s.t;
  const page = c.addPage('words', A4, t.accent);
  kicker(c, s, page, 'Опрос редакции', { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) }, t.kicker === 'bar' ? '#000000' : t.onAccent);
  c.fit(page, r.title, { ...s.headline, size: 40, color: t.onAccent }, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(32) }, { minSize: 22, maxLines: 2 });
  const list = words.slice(0, 9);
  const top = TOP + mm(50);
  const rowH = (A4.h - BOTTOM - top) / list.length;
  // Alternating colours: the theme's text-on-accent and a contrasting second colour.
  const second = t.cover === 'tabloid' ? t.soft : t.cover === 'noir' ? t.paper : t.ink;
  list.forEach((w, i) => {
    const big = i % 3 === 0;
    const color = i % 2 === 0 ? t.onAccent : second;
    const align = (['left', 'right', 'center'] as const)[i % 3];
    const used = c.fit(page, w.word, { font: big ? t.fonts.display : t.fonts.displayItalic, size: big ? 64 : 48, leading: 1, color, align, uppercase: t.headlineUppercase }, { x: MARGIN, y: top + i * rowH, w: CONTENT.w, h: rowH * 0.75 }, { minSize: 18, maxLines: 1 });
    c.fit(page, `— ${w.author}`, { ...s.label, color: i % 2 === 0 ? second : t.onAccent, align }, { x: MARGIN, y: top + i * rowH + used + mm(4), w: CONTENT.w, h: mm(4) }, { minSize: 5, maxLines: 1 });
  });
  folio(c, s, page, issue, undefined, t.onAccent);
}

function essayPages(c: Composer, s: Styles, issue: Issue, section: { heading: string; body: string }, photo: PhotoRef | undefined) {
  const t = s.t;
  const width = CONTENT.w * 0.82;
  const style: TextStyle = { ...s.lede, size: s.lede.size * 1.15, leading: 1.5, paragraphSpacing: 8 };
  const story = c.story(paragraphs(section.body).map((p) => ({ text: p, style })), width);
  let first = true;
  while (!story.done) {
    const page = c.addPage('article', A4, t.paper);
    let top = TOP;
    if (first) {
      kicker(c, s, page, 'Очерк', { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) });
      const used = c.fit(page, section.heading, { ...s.headline, size: 48 }, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(30) }, { minSize: 24, maxLines: 2 });
      top = TOP + mm(18) + used;
    }
    const frame = { x: MARGIN, y: top, w: width, h: A4.h - BOTTOM - top };
    const fitsHere = story.remainingHeight <= frame.h;
    const used = c.flow(page, story, [frame]);
    // A short essay leaves room: the bottom of the page becomes a photo.
    const free = frame.h - used - mm(10);
    if (first && fitsHere && photo && free > mm(70)) {
      c.image(page, photo, { x: -BLEED, y: top + used + mm(10), w: A4.w + 2 * BLEED, h: A4.h - (top + used + mm(10)) + BLEED });
    } else {
      folio(c, s, page, issue);
    }
    first = false;
  }
}

/**
 * Photo story: an opener page, then photo pages (1–4 photos each) with friends' wishes set as
 * quote pages evenly between them. Returns how many pages it used; never more than `free`.
 */
function photoStory(
  c: Composer,
  s: Styles,
  issue: Issue,
  r: { title: string; deck: string },
  photos: PhotoRef[],
  quotes: Array<{ text: string; author: string }>,
  free: number,
): number {
  const t = s.t;
  if (free <= 0 || (photos.length === 0 && quotes.length === 0)) return 0;
  let used = 0;
  let rest = photos;
  if (photos.length > 0) {
    const opener = photos.find((p) => p.height > p.width) ?? photos[0]!;
    const first = c.addPage('photos', A4, t.shadow);
    c.image(first, opener, FULL_BLEED);
    shade(c, s, first, -BLEED, mm(80), 0.5, 'down');
    kicker(c, s, first, 'Фотосессия', { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) }, t.kicker === 'bar' ? undefined : t.onPhoto);
    const h = c.fit(first, r.title, { ...s.headline, size: 64, color: t.onPhoto }, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(42) }, { minSize: 28, maxLines: 2 });
    if (r.deck) c.fit(first, r.deck, { ...s.deck, color: t.onPhoto }, { x: MARGIN, y: TOP + mm(11) + h, w: CONTENT.w, h: mm(12) }, { minSize: 10, maxLines: 2 });
    used++;
    rest = photos.filter((p) => p !== opener);
  }

  // How many pages go to photos and how many to quotes.
  const pages = free - used;
  let quotePages = Math.min(quotes.length, pages);
  let photoPages = Math.min(rest.length, pages - quotePages);
  if (photoPages < Math.ceil(rest.length / 4)) {
    photoPages = Math.min(pages, Math.ceil(rest.length / 4));
    quotePages = Math.min(quotePages, pages - photoPages);
  }
  // Photos first: a quote at most after every other photo page while photos can take more pages.
  while (quotePages > Math.ceil(photoPages / 2) && photoPages < rest.length) {
    quotePages--;
    photoPages++;
  }

  const rhythm = photoRhythm(rest.length, photoPages);
  // Never two quotes in a row while there are photo pages to put between them.
  if (rhythm.length > 0) quotePages = Math.min(quotePages, rhythm.length);
  const order: Array<'photo' | 'quote'> = [];
  let placed = 0;
  rhythm.forEach((_, i) => {
    order.push('photo');
    if (placed < quotePages && Math.ceil(((placed + 1) * rhythm.length) / quotePages) <= i + 1) {
      order.push('quote');
      placed++;
    }
  });
  while (placed++ < quotePages) order.push('quote');

  let cursor = 0;
  let photoIndex = 0;
  let quoteIndex = 0;
  let singles = 0;
  for (const kind of order) {
    if (kind === 'quote') quotePage(c, s, quotes.shift()!, quoteIndex++ % 2 === 0);
    else {
      const count = rhythm[photoIndex++]!;
      // Single photos alternate between full bleed and a framed print.
      photoPage(c, s, issue, rest.slice(cursor, cursor + count), count === 1 && singles++ % 2 === 1);
      cursor += count;
    }
    used++;
  }
  if (cursor < rest.length) c.warn(`Не поместилось ${rest.length - cursor} фото из галереи`);
  return used;
}

/**
 * Photos per page: follows a varied pattern (one big photo, a trio, a pair, a grid…) while
 * staying feasible, so every page gets 1–4 photos and all photos are placed.
 */
function photoRhythm(photos: number, pages: number): number[] {
  const pattern = [1, 3, 2, 4, 1, 2, 3, 2];
  const out: number[] = [];
  let left = photos;
  for (let i = 0; i < pages && left > 0; i++) {
    const pagesLeft = pages - i;
    const min = Math.max(1, left - 4 * (pagesLeft - 1));
    const max = Math.min(4, left - (pagesLeft - 1));
    const count = Math.max(min, Math.min(max, pattern[i % pattern.length]!));
    out.push(count);
    left -= count;
  }
  return out;
}

function photoPage(c: Composer, s: Styles, issue: Issue, photos: PhotoRef[], framed = false) {
  const t = s.t;
  const page = c.addPage('photos', A4, t.paper);
  if (photos.length === 1 && !framed) {
    c.image(page, photos[0]!, FULL_BLEED);
    return;
  }
  if (photos.length === 1) {
    // A gallery print: the whole photo with a border, nothing cropped away.
    const photo = photos[0]!;
    const frame = { x: MARGIN + mm(6), y: TOP + mm(6), w: CONTENT.w - mm(12), h: CONTENT.h - mm(20) };
    const scale = Math.min(frame.w / photo.width, frame.h / photo.height);
    const w = photo.width * scale;
    const h = photo.height * scale;
    c.image(page, photo, { x: frame.x + (frame.w - w) / 2, y: frame.y + (frame.h - h) / 2, w, h }, t.cover === 'noir' ? { stroke: { color: t.accent, width: 0.6 } } : {});
    folio(c, s, page, issue);
    return;
  }
  const frame = { x: MARGIN, y: TOP, w: CONTENT.w, h: CONTENT.h - mm(4) };
  const gap = t.cover === 'airy' ? mm(5) : mm(3);
  const portrait = (p: PhotoRef) => p.height > p.width;
  let boxes = photoGrid(frame, photos.length, gap);
  if (photos.length === 2 && photos.every(portrait)) {
    // Two portraits stand side by side instead of being cropped into strips.
    boxes = columns(frame, 2, gap);
  } else if (photos.length === 3 && portrait(photos[0]!)) {
    // A tall portrait on the left, two photos stacked on the right.
    const w = (frame.w - gap) * 0.58;
    const right = { x: frame.x + w + gap, w: frame.w - w - gap };
    const h = (frame.h - gap) / 2;
    boxes = [
      { x: frame.x, y: frame.y, w, h: frame.h },
      { ...right, y: frame.y, h },
      { ...right, y: frame.y + h + gap, h },
    ];
  }
  photos.forEach((photo, i) => c.image(page, photo, boxes[i]!));
  folio(c, s, page, issue);
}

function quotePage(c: Composer, s: Styles, quote: { text: string; author: string }, dark: boolean) {
  const t = s.t;
  const bg = dark ? t.dark : t.accent;
  const text = dark ? t.onDark : t.onAccent;
  const mark = dark ? t.darkAccent : t.onAccent;
  const page = c.addPage('quote', A4, bg);
  c.fit(page, '«', { font: t.fonts.display, size: 200, leading: 1, color: mark }, { x: MARGIN - mm(2), y: mm(36), w: mm(60), h: mm(60) }, { minSize: 100, maxLines: 1 });
  const used = c.fit(page, quote.text, { font: t.fonts.displayItalic, size: 44, leading: 1.12, color: text, uppercase: t.headlineUppercase }, { x: MARGIN, y: mm(96), w: CONTENT.w, h: mm(130) }, { minSize: 18, maxLines: 8 });
  c.fit(page, `— ${quote.author}`, { ...s.kicker, color: dark ? t.darkAccent : text, size: 9 }, { x: MARGIN, y: mm(104) + used, w: CONTENT.w, h: mm(6) }, { minSize: 6, maxLines: 1 });
  folio(c, s, page, undefined, undefined, dark ? t.darkRule : t.onAccent);
}

function guestBookPage(c: Composer, s: Styles, issue: Issue, first: boolean) {
  const t = s.t;
  const page = c.addPage('wishes', A4, t.paper);
  const frame = { x: MARGIN, y: TOP, w: CONTENT.w, h: CONTENT.h - mm(6) };
  c.rect(page, frame, undefined, { stroke: { color: t.accent, width: 1.2 } });
  c.fit(page, first ? 'Автографы' : 'Продолжение', { ...s.kicker, align: 'center' }, { x: frame.x, y: frame.y + mm(12), w: frame.w, h: mm(5) }, { minSize: 6, maxLines: 1 });
  c.fit(page, 'Пожелания гостей', { ...s.headline, size: 40, align: 'center' }, { x: frame.x + mm(10), y: frame.y + mm(20), w: frame.w - mm(20), h: mm(20) }, { minSize: 22, maxLines: 1 });
  c.fit(page, `Напишите ${issue.hero} пару слов — этот журнал останется на годы`, { ...s.deck, size: 12, align: 'center', color: t.muted }, { x: frame.x + mm(16), y: frame.y + mm(42), w: frame.w - mm(32), h: mm(8) }, { minSize: 8, maxLines: 1 });
  for (let y = frame.y + mm(66); y < frame.y + frame.h - mm(10); y += mm(13)) {
    page.elements.push({ type: 'line', from: { x: frame.x + mm(12), y }, to: { x: frame.x + frame.w - mm(12), y }, color: t.hairline, width: 0.6, dash: [1.5, 2.5] });
  }
  folio(c, s, page, issue);
}

// ---------- Copy built from the answers ----------

/**
 * Cover lines. Claude writes them as draft cards; with the template generator the lines
 * are built from the answers so the cover announces what is really inside.
 */
function coverLines(input: TemplateInput, c: Composer, issue: Issue): CoverLine[] {
  if (!issue.templateDraft && input.draft.cards.length > 0) return input.draft.cards;
  const m = c.materials;
  const rules = m.list('rules', 'rules').length;
  const friends = input.source.contributions.length;
  const facts = m.list('numbers', 'facts').length;
  const events = m.list('timeline', 'events').length;
  return [
    { title: 'Большое интервью', text: m.text('interview', 'threeWords') || 'Всё, о чём она молчала' },
    ...(friends > 0 ? [{ title: 'Друзья рассказали всё', text: `${friends} ${plural(friends, ['история', 'истории', 'историй'])} из первых уст` }] : []),
    ...(rules > 0 ? [{ title: 'Правила жизни', text: `${rules} ${plural(rules, ['принцип', 'принципа', 'принципов'])}, которые работают` }] : []),
    ...(events > 1 ? [{ title: 'Жизнь в датах', text: 'Хронология от первого дня' }] : facts > 1 ? [{ title: 'В цифрах', text: 'Факты, которые вас удивят' }] : []),
  ];
}

function templateTitle(hero: string, threeWords: string): string {
  const words = threeWords.trim().replace(/[.!]+$/, '');
  return words ? `${hero}: ${words.charAt(0).toLowerCase()}${words.slice(1)}` : `${hero}. Специальный выпуск`;
}

/** Editor's letter when no AI draft is available: built from the facts of the order. */
function templateLetter(c: Composer, issue: Issue): string {
  const friends = c.input.source.contributions.length;
  const occasion = issue.occasion ? `Повод — ${issue.occasion.toLowerCase()}${issue.eventDate ? `, ${formatDate(issue.eventDate)}` : ''}. ` : '';
  const crew = friends > 0 ? `Над ним втайне работали ${friends} ${plural(friends, ['человек', 'человека', 'человек'])}: они вспоминали истории, искали фотографии и честно отвечали на вопросы редакции. ` : '';
  return `Этот номер — о человеке по имени ${issue.hero}. ${occasion}${crew}Здесь всё как в настоящем глянце: интервью, правила жизни, хронология и фотосессия. Только герой номера — свой.`;
}

function issueMonth(date: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(date);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) - 1 : now.getMonth();
  const name = MONTHS_NOMINATIVE[month]!;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

const SIGNS: Array<{ end: number; name: string; dates: string }> = [
  { end: 119, name: 'Козерог', dates: '22 декабря — 19 января' },
  { end: 218, name: 'Водолей', dates: '20 января — 18 февраля' },
  { end: 320, name: 'Рыбы', dates: '19 февраля — 20 марта' },
  { end: 419, name: 'Овен', dates: '21 марта — 19 апреля' },
  { end: 520, name: 'Телец', dates: '20 апреля — 20 мая' },
  { end: 620, name: 'Близнецы', dates: '21 мая — 20 июня' },
  { end: 722, name: 'Рак', dates: '21 июня — 22 июля' },
  { end: 822, name: 'Лев', dates: '23 июля — 22 августа' },
  { end: 922, name: 'Дева', dates: '23 августа — 22 сентября' },
  { end: 1022, name: 'Весы', dates: '23 сентября — 22 октября' },
  { end: 1121, name: 'Скорпион', dates: '23 октября — 21 ноября' },
  { end: 1221, name: 'Стрелец', dates: '22 ноября — 21 декабря' },
  { end: 1231, name: 'Козерог', dates: '22 декабря — 19 января' },
];

function zodiac(date: string): { name: string; dates: string; index: number } | undefined {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return undefined;
  const md = Number(match[1]) * 100 + Number(match[2]);
  const i = SIGNS.findIndex((x) => md <= x.end);
  if (i < 0) return undefined;
  return { name: SIGNS[i]!.name, dates: SIGNS[i]!.dates, index: i % 12 };
}
