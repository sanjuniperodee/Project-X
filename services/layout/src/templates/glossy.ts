import { describeAnswers } from '@px/contracts';
import { A4, BLEED, mm, type Box, type Page, type PhotoRef, type TextStyle } from '../domain/document';
import { asPhotos, asText, Materials } from '../domain/materials';
import type { Flowable, FontMetrics } from '../domain/text';
import { backCover, coverPage, type CoverLine } from './glossy-covers';
import { albumPage, blitzPage, heroLetterPages, peoplePages, placesPages, posterPage, spreadPages, type Person, type Place, type Poster } from './glossy-extras';
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
import { arrangement, BLITZ_FIELDS, DROP_ORDER, materialHints, RUBRIC_NAMES, type Arrangement, type Plan, type RubricId } from './glossy-plan';
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
 * Rubrics, in the default reading order (each appears only when there is material for it; the customer
 * can bring some forward or leave them out in «Подача номера», see glossy-plan.ts):
 *   cover · contents · editor's letter with credits · dossier · big interview (photo opener + text) · blitz
 *   · tastes · timeline · then and now with the family album · close circle · places · in numbers · horoscope
 *   · rules of life · friends' insights · in one word · friends' essay · photo story · the customer's letter · back cover
 *
 * The page count of a format is fixed. The rubrics are measured first; the pages left are filled with what
 * the customer gave, in this order: a roomier photo story (fewer photos per page, then spreads), a page per friend,
 * roomier rubrics, full-page quotes from the hero's and friends' own words between the rubrics. Only when even that
 * is not enough do the last pages go to the guests' wishes, and the warnings say what to add to replace them.
 *
 * Structured rubrics are set straight from the answers; the AI draft supplies the prose
 * (interview, letter, cover lines) and the art direction: personal rubric titles, the cover
 * tagline and the horoscope. With the offline template generator the interview is set as Q&A.
 */

const PAGE_COUNTS: Record<string, number> = { 'a4-24': 24, 'a4-36': 36 };
const MONTHS_NOMINATIVE = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const DEFAULT_TAGLINE = 'Специальный выпуск о человеке, которого мы любим';
/** Questionnaire steps the template sets from structured answers (not as editorial text). */
const STRUCTURAL_STEPS = ['hero', 'issue', 'photos', 'rules', 'favorites', 'timeline', 'numbers', 'blitz', 'people', 'places', 'letter'];

export const glossyTemplate: Template = {
  id: 'glossy-magazine@5',

  // Cover candidates: the person is traced on them for the cut-out head over the masthead.
  portraits: (materials) => materials.photos('photos', 'cover'),

  build(input: TemplateInput, metrics: FontMetrics) {
    const target = PAGE_COUNTS[input.source.formatId] ?? 24;
    const materials = new Materials(input.product, input.source.answers);
    const arr = arrangement(materials);
    const run = (p: Plan) => buildMagazine(input, metrics, arr, p);
    const minimum = (x: Built) => x.pages + x.photo.min;

    // First pass: the rubrics alone, without the flexible pages (photo story, posters, guest pages).
    let plan: Plan = { scale: 1, spacious: false, room: 0, dropped: [], photoPages: 0, posters: 0, keepsakes: 0 };
    let r = run(plan);

    // Too much material: slightly smaller type, then without the optional rubrics, then smaller still.
    const shrink: Array<() => Plan | undefined> = [
      () => ({ ...plan, scale: 0.93 }),
      ...DROP_ORDER.map((id) => () => (r.rendered.includes(id) ? { ...plan, dropped: [...plan.dropped, id] } : undefined)),
      () => ({ ...plan, scale: 0.87 }),
    ];
    for (const step of shrink) {
      if (minimum(r) <= target) break;
      const next = step();
      if (!next) continue;
      plan = next;
      r = run(plan);
    }

    // Too little: more room for what there is, in the order the customer's focus asks for.
    const attempt = (next: Plan) => {
      const x = run(next);
      if (minimum(x) > target) return;
      plan = next;
      r = x;
    };
    const friends = input.source.contributions.length;
    const free = () => target - r.pages;
    if (minimum(r) < target) {
      // Pages still free after a photo story at its natural pace (or at its roomiest for «Больше фото»).
      const short = () => free() - (arr.focus === 'photos' ? r.photo.max : r.photo.comfortable);
      // 36 pages promise every friend a page of their own; shorter issues get them when there is room.
      const friendPagesFirst = arr.focus === 'stories' || (target >= 36 && friends <= 10);
      if (friends > 0 && friends <= 12 && (friendPagesFirst || short() > 0)) attempt({ ...plan, spacious: true });
      if (arr.focus === 'stories' ? short() > 0 : free() - r.photo.max > 0) attempt({ ...plan, room: 1 });
    }

    // The flexible pages: exactly what is left of the format.
    const total = minimum(r) <= target ? target : roundToSignature(minimum(r));
    plan = allocate(plan, r, total, arr);
    // Rather than pages for the guests: every rule and fact on a page of its own.
    if (plan.keepsakes > 0) {
      const base = { ...plan, photoPages: 0, posters: 0, keepsakes: 0 };
      const roomier = run({ ...base, room: 2 });
      if (roomier.pages > r.pages && minimum(roomier) <= target) {
        r = roomier;
        plan = allocate({ ...base, room: 2 }, r, total, arr);
      }
    }
    r = run(plan);
    // Photos taken by rubrics after an early photo story, or a spread that could not start on a left page,
    // can shift the count by a page or two: settle it with the posters and guest pages, which are one page each.
    for (let i = 0; i < 4 && r.pages !== total; i++) {
      let { photoPages, posters, keepsakes } = plan;
      let diff = total - r.pages;
      if (diff > 0) {
        const add = Math.min(diff, r.posterCount - posters);
        posters += add;
        keepsakes += diff - add;
      } else {
        diff = -diff;
        const k = Math.min(diff, keepsakes);
        keepsakes -= k;
        const p = Math.min(diff - k, posters);
        posters -= p;
        photoPages = Math.max(0, photoPages - (diff - k - p));
      }
      plan = { ...plan, photoPages, posters, keepsakes };
      r = run(plan);
    }

    const { composer } = r;
    if (!PAGE_COUNTS[input.source.formatId]) composer.warn(`Неизвестный формат «${input.source.formatId}», свёрстано на 24 страницы`);
    const pagesWord = (n: number) => `${n} ${plural(n, ['страницу', 'страницы', 'страниц'])}`;
    if (plan.dropped.length > 0) {
      const names = plan.dropped.map((id) => `«${RUBRIC_NAMES[id]}»`).join(', ');
      const fits = plan.dropped.length > 1 ? 'Войдут' : 'Войдёт';
      composer.warn(
        target < 36
          ? `Не поместилось в ${pagesWord(target)}: ${names}. ${fits}, если выбрать журнал на 36 страниц или сократить другие ответы`
          : `Не поместилось в ${pagesWord(target)}: ${names}. ${fits}, если сократить другие ответы`,
      );
    }
    if (composer.pages.length > target) {
      composer.warn(`Материалов больше, чем помещается в ${pagesWord(target)}: макет занял ${composer.pages.length}. Сократите самые длинные ответы`);
    }
    if (plan.keepsakes > 0) {
      composer.warn(`Не хватает материалов на ${pagesWord(plan.keepsakes)}: пока там страницы для пожеланий гостей. Добавьте фото или ответы — их место займут настоящие рубрики`);
    }
    // What would make the issue fuller: only when it needed pages not made of new material.
    if (plan.keepsakes > 0 || r.ownPosters > 0) {
      for (const hint of materialHints(materials, { target, skipped: arr.skipped, contributions: friends })) composer.warn(hint);
    }
    return composer.document(r.title, glossyTemplate.id);
  },
};

/** Splits the pages left after the rubrics between the photo story, the posters and (last) the guest pages. */
function allocate(plan: Plan, r: Built, total: number, arr: Arrangement): Plan {
  let rest = Math.max(0, total - r.pages);
  const cap = r.photo;
  let photoPages = Math.min(rest, Math.max(cap.min, arr.focus === 'photos' ? cap.max : cap.comfortable));
  rest -= photoPages;
  let posters = 0;
  const morePhotos = () => {
    const add = Math.min(rest, cap.max - photoPages);
    photoPages += add;
    rest -= add;
  };
  const addPosters = () => {
    const add = Math.min(rest, r.posterCount);
    posters += add;
    rest -= add;
  };
  if (arr.focus === 'stories') {
    addPosters();
    morePhotos();
  } else {
    morePhotos();
    addPosters();
  }
  return { ...plan, photoPages, posters, keepsakes: rest };
}

interface ContentsEntry {
  title: string;
  note: string;
  page: number;
}

interface Built {
  composer: Composer;
  title: string;
  /** Pages of the issue, back cover included. */
  pages: number;
  /** What the photo story can do with the photos left for it: pages at four per page, at its natural pace, with spreads. */
  photo: { min: number; comfortable: number; max: number };
  /** Posters the materials allow. */
  posterCount: number;
  /** Posters set from the hero's answers (not the friends' wishes). */
  ownPosters: number;
  rendered: Array<RubricId | 'album'>;
}

/** True for drafts made from the answers without a model: the offline generator and the customer's preview. */
function fromAnswers(input: TemplateInput): boolean {
  return input.draft.generator === 'template' || input.draft.generator === 'preview';
}

function buildMagazine(input: TemplateInput, metrics: FontMetrics, arr: Arrangement, plan: Plan): Built {
  const c = new Composer(input, metrics);
  const m = c.materials;
  const hero = m.text('hero', 'heroName') || input.source.subject;
  const issue: Issue = {
    hero,
    occasion: m.optionLabel('hero', 'occasion'),
    eventDate: m.text('hero', 'eventDate'),
    month: issueMonth(m.text('hero', 'eventDate')),
    templateDraft: fromAnswers(input),
    art: input.draft.art,
  };
  const title = issue.templateDraft ? templateTitle(hero, m.text('interview', 'threeWords')) : input.draft.title;
  const dropped = new Set(plan.dropped);

  // Photo pools.
  const coverPhotos = c.resolve(m.photos('photos', 'cover'));
  const gallery = c.resolve(m.photos('photos', 'gallery'));
  const childhood = c.resolve(m.photos('photos', 'childhood'));
  const owner = [...coverPhotos, ...gallery];
  const portraits = owner.filter((p) => p.height > p.width * 1.05);
  // The first cover photo with a clear person wins: it can stand in front of the masthead.
  const coverPhoto = coverPhotos.find((p) => p.silhouette) ?? coverPhotos[0] ?? portraits[0] ?? owner[0];
  if (!coverPhoto) c.warn('Нет фото для обложки: добавьте портрет героя крупным планом');
  const nextPortrait = () => portraits.find((p) => !c.isUsed(p)) ?? owner.find((p) => !c.isUsed(p));
  const nextPhoto = () => gallery.find((p) => !c.isUsed(p)) ?? owner.find((p) => !c.isUsed(p));

  // The style the customer chose, with the accent taken from the cover photo.
  const s = styles(themeFor(m.text('hero', 'tone'), coverPhoto?.vivid), plan.scale);
  const t = s.t;

  // Material of every rubric, so the order, the posters and the editor's letter know what the issue holds.
  const interview = interviewSection(input);
  const pull = interview ? pullQuote(c, interview) : undefined;
  const tastes = favorites(c);
  const events = timeline(c);
  const facts = m
    .list('numbers', 'facts')
    .map((f) => ({ value: asText(f.value), label: asText(f.label) }))
    .filter((f) => f.value && f.label);
  const sign = zodiac(m.text('hero', 'birthday'));
  const horoscope = issue.art?.horoscope.trim() ?? '';
  const rules = m.list('rules', 'rules').map((x) => asText(x.text)).filter(Boolean);
  const friends = friendEntries(c);
  const essay = essaySection(input);
  const blitz = blitzItems(c);
  const people: Person[] = m
    .list('people', 'people')
    .map((p) => ({ name: asText(p.name), who: asText(p.who), about: asText(p.about), photo: c.resolve(asPhotos(p.photo))[0] }))
    .filter((p) => p.name);
  const places: Place[] = m
    .list('places', 'places')
    .map((p) => ({ name: asText(p.name), story: asText(p.story), photos: c.resolve(asPhotos(p.photos)) }))
    .filter((p) => p.name);
  const letter = { text: m.text('letter', 'text'), signature: m.text('letter', 'signature') };
  const letterPhoto = c.resolve(m.photos('letter', 'photo'))[0];
  const allPhotos = owner.length + childhood.length + friends.reduce((n, f) => n + f.photos.length, 0);

  const has: Record<RubricId, boolean> = {
    dossier: hasDossier(c),
    interview: Boolean(interview),
    blitz: blitz.length >= 3,
    tastes: tastes.length >= 3,
    timeline: events.length >= 2,
    thenNow: childhood.length > 0,
    people: people.length > 0,
    places: places.length > 0,
    numbers: facts.length >= 2,
    horoscope: Boolean(horoscope && sign),
    rules: rules.length > 0,
    friends: friends.length > 0,
    photos: allPhotos > 0,
    letter: Boolean(letter.text),
  };
  const order = arr.order.filter((id) => has[id] && !dropped.has(id));

  // Posters between the rubrics: each after the rubric it belongs to, spread out so they never pile up.
  const candidates = posterCandidates(c, issue, { interview, pull, friends });
  const placed = candidates.slice(0, plan.posters);
  const after = assignPosters(placed, order);
  let posterIndex = 0;
  const posters = (id: RubricId) => {
    for (const poster of after.get(id) ?? []) posterPage(c, s, issue, poster, posterIndex++ % 2 === 0);
  };

  const contents: ContentsEntry[] = [];
  const mark = (title: string, note: string) => contents.push({ title, note, page: c.pages.length + 1 });
  const rendered: Array<RubricId | 'album'> = [];
  let photo = { min: 0, comfortable: 0, max: 0 };

  // 1. Cover
  coverPage(c, s, issue, coverPhoto, coverLines(input, c, issue), issue.art?.tagline.trim() || DEFAULT_TAGLINE);

  // 2–3. Contents and letter (contents are filled in at the end, when page numbers are known)
  const contentsPage = c.addPage('contents', A4, t.paper);
  const contentsPhoto = nextPhoto();
  if (contentsPhoto) c.image(contentsPage, contentsPhoto, { x: A4.w * 0.56, y: -BLEED, w: A4.w * 0.44 + BLEED, h: A4.h + 2 * BLEED });
  letterPage(c, s, issue, title, coverPhoto, order);

  const keepsakes = () => {
    if (plan.keepsakes <= 0) return;
    contents.push({ title: 'Пожелания гостей', note: 'Страницы для автографов на празднике', page: c.pages.length + 1 });
    // Signatures and photo frames alternate, so the guest pages read as a section of the party, not as blanks.
    for (let i = 0; i < plan.keepsakes; i++) {
      if (i % 2 === 1) partyPhotosPage(c, s, issue);
      else guestBookPage(c, s, issue, i === 0);
    }
  };

  const render: Record<RubricId, (index: number) => void> = {
    dossier: () => {
      const r = rubric(issue, 'dossier', { title: issue.hero, deck: 'Всё, что нужно знать о герое номера' });
      mark('Досье', r.deck);
      dossierPage(c, s, issue, r, nextPortrait());
    },
    interview: () => {
      const r = rubric(issue, 'interview', { title: interview!.heading, deck: m.text('interview', 'threeWords') });
      mark('Большое интервью', r.deck || 'История героя номера');
      interviewPages(c, s, issue, interview!, r, pull, nextPhoto(), nextPhoto, plan.room > 0);
    },
    blitz: () => {
      const r = rubric(issue, 'blitz', { title: `Блиц: ${issue.hero}`, deck: 'Быстрые вопросы — честные ответы' });
      mark(r.title, `${blitz.length} ${plural(blitz.length, ['вопрос', 'вопроса', 'вопросов'])} без раздумий`);
      blitzPage(c, s, issue, r, blitz);
    },
    tastes: () => {
      const r = rubric(issue, 'tastes', { title: `Что любит ${issue.hero}`, deck: `Без чего ${issue.hero} не представляет свою жизнь` });
      mark(r.title, 'Еда, музыка, места и коронная фраза');
      // Room to spare: the tastes over two pages, in larger cells.
      const perPage = plan.room === 2 && tastes.length > 3 ? Math.ceil(tastes.length / 2) : tastes.length;
      for (let i = 0; i < tastes.length; i += perPage) favoritesPage(c, s, issue, r, tastes.slice(i, i + perPage), i === 0);
    },
    timeline: () => {
      const r = rubric(issue, 'timeline', { title: 'Жизнь в датах', deck: `${events[0]!.year} — ${events.at(-1)!.year}` });
      mark(r.title, 'Хронология');
      timelinePages(c, s, issue, r, events, plan.room > 0);
    },
    thenNow: () => {
      const r = rubric(issue, 'thenNow', { title: 'Тогда и сейчас' });
      mark(r.title, 'Из семейного альбома');
      thenAndNowPage(c, s, issue, r, childhood[0]!, nextPortrait() ?? coverPhoto, m.text('interview', 'childhood'));
      // The other childhood photos get a page of their own instead of going to the photo story.
      const album = childhood.filter((p) => !c.isUsed(p)).slice(0, 4);
      if (album.length >= 2 && !dropped.has('album')) {
        albumPage(c, s, issue, rubric(issue, 'album', { title: 'Семейный альбом', deck: 'Детство героя номера — из семейного архива' }), album);
        rendered.push('album');
      }
    },
    people: () => {
      const r = rubric(issue, 'people', { title: 'Близкий круг', deck: `Люди, без которых ${issue.hero} — не ${issue.hero}` });
      mark(r.title, `${people.length} ${plural(people.length, ['человек', 'человека', 'человек'])} рядом с героем`);
      peoplePages(c, s, issue, r, people, plan.room > 0);
    },
    places: () => {
      const r = rubric(issue, 'places', { title: 'Места силы', deck: `Где ${issue.hero} становится собой` });
      mark(r.title, places.map((p) => p.name).slice(0, 3).join(', '));
      placesPages(c, s, issue, r, places, plan.room > 0);
    },
    numbers: () => {
      const r = rubric(issue, 'numbers', { title: `${issue.hero} в цифрах` });
      mark(r.title, `${facts.length} ${plural(facts.length, ['факт', 'факта', 'фактов'])} о герое`);
      const perPage = plan.room === 2 ? 2 : 8;
      for (let i = 0; i < facts.length; i += perPage) numbersPage(c, s, issue, r, facts.slice(i, i + perPage), i === 0);
    },
    horoscope: () => {
      const r = rubric(issue, 'horoscope', { title: sign!.name });
      mark('Гороскоп номера', `${sign!.name}: что звёзды говорят о герое`);
      horoscopePage(c, s, issue, r, sign!, horoscope);
    },
    rules: () => {
      const r = rubric(issue, 'rules', { title: 'Правила жизни', deck: m.text('hero', 'profession') });
      mark(r.title, `${rules.length} ${plural(rules.length, ['правило', 'правила', 'правил'])} героя`);
      rulesPages(c, s, issue, r, rules, nextPortrait(), plan.room);
    },
    friends: () => {
      const r = rubric(issue, 'friends', { title: 'Говорят друзья' });
      mark(r.title, `${friends.length} ${plural(friends.length, ['история', 'истории', 'историй'])} из первых уст`);
      if (plan.spacious) friends.forEach((friend) => friendFeaturePage(c, s, issue, friend));
      else friendsPages(c, s, issue, r, friends);
      const words = friends.map((f) => ({ word: f.oneWord, author: f.author })).filter((w) => w.word);
      if (words.length >= 2) oneWordPage(c, s, issue, rubric(issue, 'words', { title: `${issue.hero} одним словом` }), words);
      // Friends' essay (AI drafts only)
      if (essay) {
        mark(essay.heading, 'Портрет, собранный из историй друзей');
        essayPages(c, s, issue, essay, nextPhoto());
      }
    },
    photos: (index) => {
      // Photos the later rubrics still need stay out of the story.
      const later = new Set(order.slice(index + 1));
      const pool = storyPool(c, { owner, childhood, friends, later, laterNeeds: genericPhotoNeeds(later, { letterPhoto: Boolean(letterPhoto) }) });
      photo = photoCapacity(pool);
      const story = after.get('photos') ?? [];
      after.delete('photos');
      const r = rubric(issue, 'photos', { title: 'Лучшие кадры' });
      if (plan.photoPages > 0 && pool.length > 0) mark(r.title, 'Фотосессия');
      photoStory(c, s, issue, r, pool, plan.photoPages, story, () => posterIndex++ % 2 === 0);
    },
    letter: () => {
      const r = rubric(issue, 'letter', { title: 'Письмо герою' });
      mark(r.title, letter.signature ? `От: ${letter.signature}` : 'Несколько слов от того, кто собрал этот номер');
      heroLetterPages(c, s, issue, r, letter, letterPhoto ?? nextPortrait());
    },
  };

  order.forEach((id, index) => {
    // The customer's letter closes the issue: the guest pages, if any, come before it.
    if (id === 'letter' && index === order.length - 1) keepsakes();
    const before = c.pages.length;
    render[id](index);
    if (c.pages.length > before) rendered.push(id);
    posters(id);
  });
  if (order.at(-1) !== 'letter') keepsakes();
  if (order.includes('photos') === false && allPhotos > 0) {
    const left = [...owner, ...childhood].filter((p) => !c.isUsed(p)).length;
    if (left > 0) c.warn(`Фотосессия убрана из номера: ${left} фото в него не вошли`);
  }

  backCover(c, s, issue, m.text('favorites', 'phrase'), input.draft.cards.at(-1)?.title, input.source.issueUrl);
  fillContents(c, s, contentsPage, issue, contents);
  return {
    composer: c,
    title,
    pages: c.pages.length,
    photo,
    posterCount: candidates.length,
    ownPosters: placed.filter((p) => p.own).length,
    rendered,
  };
}

/**
 * Posters the materials allow, best first: the friends' wishes, the hero's own short answers (the lesson, advice,
 * the signature phrase, the dream…), the three words as a manifesto, then strong sentences of the interview.
 * Nothing that is already the pull quote of the interview.
 */
function posterCandidates(
  c: Composer,
  issue: Issue,
  material: { interview: { body: string } | undefined; pull: string | undefined; friends: Friend[] },
): Poster[] {
  const m = c.materials;
  const seen = new Set<string>(material.pull ? [normalize(material.pull)] : []);
  const out: Poster[] = [];
  const quote = (text: string, author: string, anchor: string, own: boolean) => {
    const clean = text.trim().replace(/^[«"]|[»"]$/g, '');
    if (clean.length < 8 || clean.length > 220 || seen.has(normalize(clean))) return;
    seen.add(normalize(clean));
    out.push({ kind: 'quote', text: clean, author, anchor, own });
  };
  for (const friend of material.friends) if (friend.wish) quote(friend.wish, friend.author, 'photos', false);
  const own: Array<[string, string, RubricId]> = [
    ['interview', 'lesson', 'interview'],
    ['interview', 'advice', 'timeline'],
    ['favorites', 'phrase', 'tastes'],
    ['interview', 'dream', 'dossier'],
    ['blitz', 'happiness', 'blitz'],
    ['interview', 'touches', 'people'],
  ];
  for (const [step, field, anchor] of own) quote(m.text(step, field), issue.hero, anchor, true);
  const words = m
    .text('interview', 'threeWords')
    .split(/[,;.\n]+|\s+и\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length >= 2 && words.length <= 4 && words.every((w) => w.length <= 24)) out.push({ kind: 'words', words: words.map(capitalize), anchor: 'dossier', own: true });
  if (material.interview) {
    const sentences = paragraphs(material.interview.body)
      .map((p) => (issue.templateDraft ? (splitLabel(p)?.value ?? p) : p))
      .flatMap((p) => p.split(/(?<=[.!?])\s+/))
      .filter((x) => x.length >= 50 && x.length <= 160);
    const anchors: RubricId[] = ['interview', 'rules', 'numbers', 'places', 'thenNow', 'friends'];
    // Lines of the interview are the editor's words, not the hero's: signed with the rubric.
    sentences.slice(0, 6).forEach((sentence, i) => quote(sentence.replace(/[.]$/, ''), 'из большого интервью', anchors[i % anchors.length]!, true));
  }
  return out;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function capitalize(word: string): string {
  return word.charAt(0).toLocaleUpperCase('ru-RU') + word.slice(1);
}

/**
 * Which rubric each poster follows: its own when it is in the issue and has no poster yet, otherwise the rubric
 * with the fewest posters so far. Never after the customer's closing letter.
 */
function assignPosters(posters: Poster[], order: RubricId[]): Map<RubricId, Poster[]> {
  const slots = order.filter((id, i) => !(id === 'letter' && i === order.length - 1));
  const out = new Map<RubricId, Poster[]>();
  if (slots.length === 0) return out;
  const load = (id: RubricId) => out.get(id)?.length ?? 0;
  for (const poster of posters) {
    const own = slots.find((id) => id === poster.anchor);
    const target = own && load(own) === 0 ? own : slots.reduce((best, id) => (load(id) < load(best) ? id : best), slots[0]!);
    out.set(target, [...(out.get(target) ?? []), poster]);
  }
  return out;
}

/** Generic photos (not their own) the rubrics take: the photo story leaves that many when it comes before them. */
function genericPhotoNeeds(later: ReadonlySet<RubricId>, options: { letterPhoto: boolean }): number {
  const needs: Partial<Record<RubricId, number>> = { dossier: 1, interview: 2, thenNow: 1, rules: 1, friends: 1, letter: options.letterPhoto ? 0 : 1 };
  return [...later].reduce((n, id) => n + (needs[id] ?? 0), 0);
}

/** Photos for the story: everything not placed yet, minus what the rubrics after it will need. */
function storyPool(
  c: Composer,
  material: { owner: PhotoRef[]; childhood: PhotoRef[]; friends: Friend[]; later: ReadonlySet<RubricId>; laterNeeds: number },
): PhotoRef[] {
  const { owner, childhood, friends, later } = material;
  const unused = (p: PhotoRef) => !c.isUsed(p);
  const ownerLeft = owner.filter(unused);
  // Portraits first: that is what the dossier, the rules and the letter take.
  const reserve = new Set([...ownerLeft.filter((p) => p.height > p.width), ...ownerLeft].slice(0, material.laterNeeds));
  const pool = [
    ...ownerLeft.filter((p) => !reserve.has(p)),
    ...(later.has('thenNow') ? [] : childhood.filter(unused)),
    ...friends.flatMap((f) => (later.has('friends') ? f.photos.slice(1) : f.photos)).filter(unused),
  ];
  return [...new Set(pool)];
}

function blitzItems(c: Composer): Array<{ question: string; answer: string }> {
  const m = c.materials;
  return BLITZ_FIELDS.map((id) => ({ question: m.field('blitz', id)?.label ?? '', answer: m.text('blitz', id) })).filter((x) => x.question && x.answer);
}

// ---------- Rubrics ----------

function letterPage(c: Composer, s: Styles, issue: Issue, title: string, portrait: PhotoRef | undefined, order: RubricId[]) {
  const t = s.t;
  const page = c.addPage('letter', A4, t.paper);
  kicker(c, s, page, 'Письмо редактора', { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) });
  const headUsed = c.fit(page, title, { ...s.headline, size: 40 }, { x: MARGIN, y: TOP + mm(9), w: mm(150), h: mm(56) }, { minSize: 24, maxLines: 4 });
  let y = TOP + mm(9) + headUsed + mm(10);
  const lead = issue.templateDraft || !c.input.draft.lead.trim() ? templateLetter(c, issue, order) : c.input.draft.lead;
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
  const list = entries.slice(0, 14);
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

function interviewSection(input: TemplateInput): { heading: string; body: string } | undefined {
  const sections = editorialSections(input, STRUCTURAL_STEPS);
  if (fromAnswers(input)) {
    const step = input.product.steps.find((x) => x.id === 'interview');
    const title = step?.title.trim().toLowerCase();
    const found = sections.find((x) => x.heading.trim().toLowerCase() === title);
    if (found || !step) return found;
    // A draft without the interview section (e.g. built before the questionnaire changed): straight from the answers.
    const body = describeAnswers(step, input.source.answers.interview);
    return body ? { heading: step.title, body } : undefined;
  }
  return sections.find((x) => /интервью/i.test(x.heading)) ?? sections.find((x) => !/друз|правил|хронолог/i.test(x.heading));
}

function essaySection(input: TemplateInput): { heading: string; body: string } | undefined {
  if (fromAnswers(input)) return undefined;
  return editorialSections(input, []).find((x) => /друз/i.test(x.heading) && !/инсайд/i.test(x.heading));
}

function interviewPages(
  c: Composer,
  s: Styles,
  issue: Issue,
  section: { heading: string; body: string },
  r: { title: string; deck: string },
  pullText: string | undefined,
  opener: PhotoRef | undefined,
  spare: () => PhotoRef | undefined,
  room: boolean,
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
  // With room to spare the interview is set larger: easier to read, and it fills its pages honestly.
  const flowables = articleFlowables(section, s, issue.templateDraft, room ? 1.15 : 1);
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
    let banded = false;
    // A short interview leaves the page half empty: give its lower part to a photo.
    if (first && story.remainingHeight < (left.h + right.h) * 0.5) {
      const band = Math.min(mm(110), left.h - story.remainingHeight / 2 - mm(70));
      const photo = band > mm(60) ? spare() : undefined;
      if (photo) {
        c.image(page, photo, { x: -BLEED, y: A4.h - band, w: A4.w + 2 * BLEED, h: band + BLEED });
        left = { ...left, h: left.h - band - mm(6) + BOTTOM };
        right = { ...right, h: right.h - band - mm(6) + BOTTOM };
        banded = true;
      }
    }
    // An interview a little longer than one column: balanced columns, the pull quote across the page under them.
    const quoteSpace = pullText ? mm(56) : 0;
    const balanced = first && !banded && story.remainingHeight > left.h * 0.8 && story.remainingHeight <= 2 * left.h - quoteSpace - mm(24);
    if (balanced) {
      const colH = Math.min(left.h, story.remainingHeight / 2 + mm(10));
      c.flow(page, story, [{ ...left, h: colH }, { ...right, h: colH }]);
      if (pullText) {
        const qy = top + colH + mm(8);
        c.rect(page, { x: MARGIN, y: qy, w: mm(24), h: 2 }, t.accent);
        c.fit(page, `«${pullText}»`, { ...s.pull, size: s.pull.size * 1.25, uppercase: t.cover === 'tabloid' }, { x: MARGIN, y: qy + mm(5), w: CONTENT.w * 0.85, h: A4.h - BOTTOM - qy - mm(5) }, { minSize: 12, maxLines: 4 });
      }
      folio(c, s, page, issue);
      first = false;
      continue;
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
function articleFlowables(section: { heading: string; body: string }, s: Styles, qa: boolean, scale = 1): Flowable[] {
  const items = paragraphs(section.body);
  const body = { ...s.body, size: s.body.size * scale };
  const question = { ...s.question, size: s.question.size * scale };
  const lede = { ...s.lede, size: s.lede.size * scale };
  return items.flatMap((p, i): Flowable[] => {
    const pair = qa ? splitLabel(p) : null;
    if (pair) return [{ text: pair.label, style: question, keepWithNext: true, spaceBefore: i === 0 ? 0 : 7 * scale }, { text: pair.value, style: body }];
    if (i === 0) return [{ text: p, style: lede }];
    return [{ text: p, style: body }];
  });
}

function pullQuote(c: Composer, section: { body: string }): string | undefined {
  const m = c.materials;
  const candidates = [m.text('interview', 'lesson'), m.text('favorites', 'phrase'), m.text('interview', 'dream'), m.text('interview', 'advice')];
  const own = candidates.find((x) => x && x.length <= 160);
  if (own) return own.replace(/^[«"]|[»"]$/g, '');
  const sentence = paragraphs(section.body)
    .map((p) => (fromAnswers(c.input) ? (splitLabel(p)?.value ?? p) : p))
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

function favoritesPage(c: Composer, s: Styles, issue: Issue, r: { title: string; deck: string }, items: Array<{ label: string; value: string }>, first = true) {
  const t = s.t;
  const page = c.addPage('tastes', A4, t.panel);
  kicker(c, s, page, first ? 'Рубрика' : r.title, { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) });
  const used = first ? c.fit(page, r.title, s.headline, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(40) }, { minSize: 26, maxLines: 2 }) : 0;
  const deckUsed = first ? c.fit(page, r.deck, s.deck, { x: MARGIN, y: TOP + mm(11) + used, w: CONTENT.w, h: mm(14) }, { minSize: 10, maxLines: 2 }) : 0;

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

function timelinePages(c: Composer, s: Styles, issue: Issue, r: { title: string; deck: string }, events: Array<{ year: string; title: string; photo?: PhotoRef }>, room: boolean) {
  const t = s.t;
  // Room: taller rows and larger photos of the time.
  const photoRow = room ? mm(62) : mm(44);
  const textRow = room ? mm(32) : mm(24);
  const photoW = room ? mm(74) : mm(52);
  const axis = MARGIN + mm(38);
  const rowOf = (event: { photo?: PhotoRef }) => (event.photo ? photoRow : textRow);
  const open = (first: boolean) => {
    const page = c.addPage('timeline', A4, t.paper);
    let top = TOP;
    if (first) {
      kicker(c, s, page, 'Хронология', { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) });
      const used = c.fit(page, r.title, s.headline, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(40) }, { minSize: 26, maxLines: 2 });
      const deckUsed = c.fit(page, r.deck, s.deck, { x: MARGIN, y: TOP + mm(11) + used, w: CONTENT.w, h: mm(10) }, { minSize: 10, maxLines: 1 });
      top = TOP + mm(22) + used + deckUsed;
    }
    c.line(page, { x: axis, y: top }, { x: axis, y: A4.h - BOTTOM }, t.accent, 1.2);
    return { page, y: top + mm(2) };
  };

  // Events split evenly over the pages they need (no lone event on a last page), rows spaced to fill each page.
  let current = open(true);
  const firstCap = A4.h - BOTTOM - current.y;
  const nextCap = A4.h - BOTTOM - (TOP + mm(2));
  const total = events.reduce((h, e) => h + rowOf(e), 0);
  const split = (limit: (page: number) => number) => {
    const pages: Array<typeof events> = [[]];
    let used = 0;
    for (const event of events) {
      const cap = limit(pages.length - 1);
      if (used + rowOf(event) > cap && pages.at(-1)!.length > 0) {
        pages.push([]);
        used = 0;
      }
      pages.at(-1)!.push(event);
      used += rowOf(event);
    }
    return pages;
  };
  const capOf = (i: number) => (i === 0 ? firstCap : nextCap);
  const greedy = split(capOf);
  const share = total / greedy.length + Math.max(photoRow, textRow) / 2;
  const even = split((i) => Math.min(capOf(i), share));
  const pages = even.length === greedy.length ? even : greedy;

  pages.forEach((group, index) => {
    if (index > 0) current = open(false);
    const { page } = current;
    const used = group.reduce((h, e) => h + rowOf(e), 0);
    const gap = group.length > 1 ? Math.min(mm(45), Math.max(0, capOf(index) - used) / group.length) : 0;
    let y = current.y;
    for (const event of group) {
      const rowH = rowOf(event);
      c.fit(page, event.year, { font: t.fonts.numeral, size: 30, leading: 1, color: t.ink, align: 'right' }, { x: MARGIN, y, w: axis - MARGIN - mm(7), h: mm(12) }, { minSize: 14, maxLines: 1 });
      page.elements.push({ type: 'ellipse', cx: axis, cy: y + mm(5), rx: mm(2.2), ry: mm(2.2), fill: t.accent });
      const textX = axis + mm(8);
      const textW = event.photo ? A4.w - MARGIN - textX - photoW - mm(6) : A4.w - MARGIN - textX;
      c.fit(page, event.title, { font: t.fonts.serif, size: s.lede.size * (room ? 1.3 : 1.15), leading: 1.3, color: t.ink }, { x: textX, y: y + mm(1), w: textW, h: rowH - mm(6) }, { minSize: 10, maxLines: 5 });
      if (event.photo) c.image(page, event.photo, { x: A4.w - MARGIN - photoW, y, w: photoW, h: rowH - mm(6) });
      y += rowH + gap;
    }
    folio(c, s, page, issue);
  });
}

function numbersPage(c: Composer, s: Styles, issue: Issue, r: { title: string; deck: string }, facts: Array<{ value: string; label: string }>, first = true) {
  const t = s.t;
  const page = c.addPage('numbers', A4, t.dark);
  kicker(c, s, page, first ? 'Инфографика' : r.title, { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) }, t.kicker === 'bar' ? '#000000' : t.darkAccent);
  const used = first ? c.fit(page, r.title, { ...s.headline, color: t.onDark }, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(42) }, { minSize: 26, maxLines: 2 }) : 0;
  const deckUsed = first && r.deck ? c.fit(page, r.deck, { ...s.deck, color: t.onDark }, { x: MARGIN, y: TOP + mm(11) + used, w: CONTENT.w, h: mm(12) }, { minSize: 10, maxLines: 2 }) : 0;
  const list = facts.slice(0, 8);
  const top = TOP + mm(22) + used + deckUsed;
  // Two facts on a page are stacked, each across the full width; more go in two columns.
  const stacked = list.length <= 2;
  const rows = stacked ? list.length : Math.ceil(list.length / 2);
  const cellW = stacked ? CONTENT.w : (CONTENT.w - GUTTER * 2) / 2;
  const cellH = (A4.h - BOTTOM - top) / Math.max(rows, 2);
  list.forEach((fact, i) => {
    const x = stacked ? MARGIN : MARGIN + (i % 2) * (cellW + GUTTER * 2);
    const y = top + (stacked ? i : Math.floor(i / 2)) * cellH;
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

function rulesPages(c: Composer, s: Styles, issue: Issue, r: { title: string; deck: string }, rules: string[], portrait: PhotoRef | undefined, room: 0 | 1 | 2) {
  const t = s.t;
  if (room === 2 && rules.length > 1) return rulePosters(c, s, issue, r, rules, portrait);
  const photoW = portrait ? A4.w * 0.36 : 0;
  const textW = A4.w - MARGIN - photoW - mm(10) - (portrait ? 0 : MARGIN - mm(10));
  const k = room > 0 ? 1.3 : 1;
  const flowables = rules.flatMap((rule, i): Flowable[] => [
    { text: String(i + 1).padStart(2, '0'), style: { font: t.fonts.numeral, size: 22 * k, leading: 1.05, color: t.accent }, keepWithNext: true, spaceBefore: i === 0 ? 0 : 11 * k },
    { text: rule, style: { font: t.fonts.serif, size: s.lede.size * 1.3 * k, leading: 1.28, color: t.ink } },
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

/** Rules of life with room to spare: the first with the rubric and the portrait, then one rule a page in large type. */
function rulePosters(c: Composer, s: Styles, issue: Issue, r: { title: string; deck: string }, rules: string[], portrait: PhotoRef | undefined) {
  const t = s.t;
  rules.forEach((rule, i) => {
    const page = c.addPage('rules', A4, i % 2 === 0 ? t.paper : t.soft);
    const top = TOP + mm(30);
    if (i === 0) {
      const photoW = portrait ? A4.w * 0.36 : 0;
      if (portrait) c.image(page, portrait, { x: A4.w - photoW, y: -BLEED, w: photoW + BLEED, h: A4.h + 2 * BLEED }, { focusY: 0.25 });
      const w = A4.w - MARGIN * 2 - photoW;
      kicker(c, s, page, issue.hero, { x: MARGIN, y: TOP, w, h: mm(5) });
      const used = c.fit(page, r.title, { ...s.headline, size: 60 }, { x: MARGIN, y: TOP + mm(8), w, h: mm(50) }, { minSize: 28, maxLines: 3 });
      const y = TOP + mm(30) + used;
      const numH = c.fit(page, '01', { font: t.fonts.numeral, size: 90, leading: 1, color: t.accent }, { x: MARGIN, y, w, h: mm(34) }, { minSize: 40, maxLines: 1 });
      c.fit(page, rule, { font: t.fonts.serif, size: 34, leading: 1.2, color: t.ink }, { x: MARGIN, y: y + numH + mm(8), w, h: A4.h - BOTTOM - (y + numH + mm(8)) }, { minSize: 14, maxLines: 8, verticalAlign: 'top' });
    } else {
      kicker(c, s, page, `${r.title} · ${issue.hero}`, { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) });
      const numH = c.fit(page, String(i + 1).padStart(2, '0'), { font: t.fonts.numeral, size: 160, leading: 1, color: t.accent }, { x: MARGIN, y: top, w: CONTENT.w, h: mm(60) }, { minSize: 60, maxLines: 1 });
      c.fit(page, rule, { font: t.fonts.displayItalic, size: 52, leading: 1.12, color: t.ink, uppercase: t.headlineUppercase }, { x: MARGIN, y: top + numH + mm(12), w: CONTENT.w, h: A4.h - BOTTOM - (top + numH + mm(12)) }, { minSize: 18, maxLines: 7, verticalAlign: 'top' });
    }
    folio(c, s, page, issue);
  });
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

/** What the photo story can do with `photos`: pages at four photos a page, at its natural pace, with a photo a page and spreads. */
function photoCapacity(photos: PhotoRef[]): { min: number; comfortable: number; max: number } {
  if (photos.length === 0) return { min: 0, comfortable: 0, max: 0 };
  const rest = photos.length - 1; // the opener takes one
  const spreads = photos.filter((p) => p !== storyOpener(photos) && isLandscape(p)).length;
  return { min: 1 + Math.ceil(rest / 4), comfortable: 1 + Math.ceil(rest / 2.25), max: 1 + rest + spreads };
}

function storyOpener(photos: PhotoRef[]): PhotoRef {
  return photos.find((p) => p.height > p.width) ?? photos[0]!;
}

function isLandscape(photo: PhotoRef): boolean {
  return photo.width > photo.height * 1.15;
}

/**
 * Photo story in exactly `budget` pages (as far as the photos allow): an opener, then photo pages. A small budget
 * sets up to four photos a page; a larger one gives each photo a page of its own and lets landscapes run across a
 * spread. The quotes assigned to the story are set between the photo pages.
 */
function photoStory(
  c: Composer,
  s: Styles,
  issue: Issue,
  r: { title: string; deck: string },
  photos: PhotoRef[],
  budget: number,
  quotes: Poster[],
  dark: () => boolean,
) {
  const t = s.t;
  const pages = Math.min(budget, photoCapacity(photos).max);
  if (pages <= 0) {
    if (photos.length > 0 && budget > 0) c.warn(`Не поместилось ${photos.length} фото из галереи`);
    for (const quote of quotes) posterPage(c, s, issue, quote, dark());
    return;
  }
  const opener = storyOpener(photos);
  const first = c.addPage('photos', A4, t.shadow);
  c.image(first, opener, FULL_BLEED);
  shade(c, s, first, -BLEED, mm(80), 0.5, 'down');
  kicker(c, s, first, 'Фотосессия', { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) }, t.kicker === 'bar' ? undefined : t.onPhoto);
  const h = c.fit(first, r.title, { ...s.headline, size: 64, color: t.onPhoto }, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(42) }, { minSize: 28, maxLines: 2 });
  if (r.deck) c.fit(first, r.deck, { ...s.deck, color: t.onPhoto }, { x: MARGIN, y: TOP + mm(11) + h, w: CONTENT.w, h: mm(12) }, { minSize: 10, maxLines: 2 });

  const rest = photos.filter((p) => p !== opener);
  const left = pages - 1;
  type Item = { kind: 'page'; photos: PhotoRef[] } | { kind: 'spread'; photo: PhotoRef } | { kind: 'quote'; poster: Poster };
  const items: Item[] = [];
  if (left >= rest.length) {
    // A page per photo, and the extra pages turn landscapes into spreads.
    let spreads = left - rest.length;
    for (const photo of rest) {
      if (spreads > 0 && isLandscape(photo)) {
        items.push({ kind: 'spread', photo });
        spreads--;
      } else items.push({ kind: 'page', photos: [photo] });
    }
  } else {
    const placeable = rest.slice(0, left * 4);
    if (placeable.length < rest.length) c.warn(`Не поместилось ${rest.length - placeable.length} фото из галереи`);
    let cursor = 0;
    for (const count of photoRhythm(placeable.length, left)) {
      items.push({ kind: 'page', photos: placeable.slice(cursor, cursor + count) });
      cursor += count;
    }
  }
  // Quotes evenly between the photo pages, never two in a row while there are photos to put between them.
  const sequence: Item[] = [];
  let quoted = 0;
  items.forEach((item, i) => {
    sequence.push(item);
    const due = Math.floor(((i + 1) * quotes.length) / items.length);
    while (quoted < due) sequence.push({ kind: 'quote', poster: quotes[quoted++]! });
  });
  while (quoted < quotes.length) sequence.push({ kind: 'quote', poster: quotes[quoted++]! });

  let singles = 0;
  for (let i = 0; i < sequence.length; i++) {
    let item = sequence[i]!;
    // A spread opens on a left-hand (even) page: bring the next single page or quote forward if needed.
    if (item.kind === 'spread' && (c.pages.length + 1) % 2 === 1) {
      const swap = sequence.findIndex((x, j) => j > i && x.kind !== 'spread');
      if (swap > 0) {
        [sequence[i], sequence[swap]] = [sequence[swap]!, sequence[i]!];
        item = sequence[i]!;
      } else item = { kind: 'page', photos: [item.photo] };
    }
    if (item.kind === 'quote') posterPage(c, s, issue, item.poster, dark());
    else if (item.kind === 'spread') spreadPages(c, s, item.photo);
    // Single photos alternate between full bleed and a framed print.
    else photoPage(c, s, issue, item.photos, item.photos.length === 1 && singles++ % 2 === 1);
  }
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

/** Frames for instant photos from the party, with a line under each for a caption. */
function partyPhotosPage(c: Composer, s: Styles, issue: Issue) {
  const t = s.t;
  const page = c.addPage('wishes', A4, t.panel);
  kicker(c, s, page, 'На празднике', { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) });
  const used = c.fit(page, 'Фото с праздника', { ...s.headline, size: 40 }, { x: MARGIN, y: TOP + mm(8), w: CONTENT.w, h: mm(20) }, { minSize: 22, maxLines: 1 });
  c.fit(page, 'Вклейте сюда снимки этого вечера и подпишите, кто на них', { ...s.deck, size: 12, color: t.muted }, { x: MARGIN, y: TOP + mm(11) + used, w: CONTENT.w, h: mm(8) }, { minSize: 8, maxLines: 1 });
  const top = TOP + mm(26) + used;
  const frame = { x: MARGIN, y: top, w: CONTENT.w, h: A4.h - BOTTOM - top - mm(4) };
  for (const box of photoGrid(frame, 4, mm(8))) {
    const photoBox = { ...box, h: box.h - mm(12) };
    c.rect(page, photoBox, t.card, { stroke: { color: t.hairline, width: 0.8 } });
    c.rect(page, { x: photoBox.x + mm(5), y: photoBox.y + mm(5), w: photoBox.w - mm(10), h: photoBox.h - mm(10) }, undefined, { stroke: { color: t.accent, width: 0.6, dash: [2, 2] } });
    page.elements.push({ type: 'line', from: { x: box.x, y: box.y + box.h - mm(3) }, to: { x: box.x + box.w, y: box.y + box.h - mm(3) }, color: t.hairline, width: 0.6, dash: [1.5, 2.5] });
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
function templateLetter(c: Composer, issue: Issue, order: RubricId[]): string {
  const friends = c.input.source.contributions.length;
  const occasion = issue.occasion ? `Повод — ${issue.occasion.toLowerCase()}${issue.eventDate ? `, ${formatDate(issue.eventDate)}` : ''}. ` : '';
  const crew = friends > 0 ? `Над ним втайне работали ${friends} ${plural(friends, ['человек', 'человека', 'человек'])}: они вспоминали истории, искали фотографии и честно отвечали на вопросы редакции. ` : '';
  const names = order.filter((id) => id !== 'letter' && id !== 'dossier').slice(0, 4).map((id) => RUBRIC_NAMES[id].toLowerCase());
  const inside = names.length > 1 ? `${names.slice(0, -1).join(', ')} и ${names.at(-1)}` : names[0] ?? 'интервью';
  return `Этот номер — о человеке по имени ${issue.hero}. ${occasion}${crew}Здесь всё как в настоящем глянце: ${inside}. Только герой номера — свой.`;
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
