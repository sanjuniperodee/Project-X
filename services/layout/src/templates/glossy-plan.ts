import { asText, type Materials } from '../domain/materials';
import { plural } from './glossy-kit';

/**
 * How a Cover Me issue is put together: which rubrics in what order (the customer's «Подача номера»),
 * and how the fixed page count of the format is filled when the materials are short or long.
 */

/** Rubrics in the order of the questionnaire's «С чего начать номер» / «Без каких рубрик обойтись». */
export type RubricId =
  | 'dossier'
  | 'interview'
  | 'blitz'
  | 'tastes'
  | 'timeline'
  | 'thenNow'
  | 'people'
  | 'places'
  | 'numbers'
  | 'horoscope'
  | 'rules'
  | 'friends'
  | 'photos'
  | 'letter';

const RUBRIC_IDS: readonly RubricId[] = ['dossier', 'interview', 'blitz', 'tastes', 'timeline', 'numbers', 'horoscope', 'thenNow', 'people', 'places', 'rules', 'friends', 'photos', 'letter'];

/** Reading order when the customer did not choose one. The customer's letter closes the issue. */
export const DEFAULT_ORDER: readonly RubricId[] = RUBRIC_IDS;

/** Names the customer saw in the questionnaire, for messages. */
export const RUBRIC_NAMES: Record<RubricId | 'album', string> = {
  dossier: 'Досье',
  interview: 'Большое интервью',
  blitz: 'Блиц',
  tastes: 'Любимое',
  timeline: 'Хронология',
  thenNow: 'Тогда и сейчас',
  album: 'Семейный альбом',
  people: 'Близкий круг',
  places: 'Места силы',
  numbers: 'В цифрах',
  horoscope: 'Гороскоп',
  rules: 'Правила жизни',
  friends: 'Говорят друзья',
  photos: 'Фотосессия',
  letter: 'Письмо герою',
};

export type Focus = 'balance' | 'photos' | 'stories';

export interface Arrangement {
  focus: Focus;
  /** Rubrics in reading order, without the skipped ones. */
  order: RubricId[];
  skipped: ReadonlySet<RubricId>;
}

/** The customer's arrangement: «Чего в номере больше», «С чего начать номер», «Без каких рубрик обойтись». */
export function arrangement(m: Materials): Arrangement {
  const focusAnswer = m.text('issue', 'focus');
  const focus: Focus = focusAnswer === 'photos' || focusAnswer === 'stories' ? focusAnswer : 'balance';
  const skipped = new Set<RubricId>(rubricIds(m.step('issue').skipRubrics).filter((id) => id !== 'interview'));
  let base = [...DEFAULT_ORDER];
  // «Больше фото» opens the photo story right after the interview, «Больше историй» brings the friends forward.
  if (focus === 'photos') base = moveAfter(base, 'photos', 'interview');
  if (focus === 'stories') base = moveAfter(base, 'friends', 'interview');
  const first = rubricIds(m.step('issue').firstRubrics);
  const order = [...new Set([...first, ...base])].filter((id) => !skipped.has(id));
  return { focus, order, skipped };
}

function rubricIds(value: unknown): RubricId[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is RubricId => typeof v === 'string' && (RUBRIC_IDS as readonly string[]).includes(v));
}

function moveAfter(order: RubricId[], id: RubricId, after: RubricId): RubricId[] {
  const rest = order.filter((x) => x !== id);
  rest.splice(rest.indexOf(after) + 1, 0, id);
  return rest;
}

/**
 * Knobs of one build. The format's page count is fixed (24 or 36: saddle stitch and binding print in sheets),
 * so the template first measures the rubrics and then decides how the remaining pages are filled:
 * more room for the material there is, then pages made of the hero's and friends' own words,
 * and only as the last resort pages for the guests (with a warning that says what to add instead).
 */
export interface Plan {
  /** Running text size: below 1 when the materials do not fit. */
  scale: number;
  /** A page of its own for every friend. */
  spacious: boolean;
  /**
   * Room for the rubrics. 1: larger type in the interview and rules, a taller timeline, fewer people and places
   * per page. 2 (only instead of guest pages): every rule and every pair of facts gets a page, the tastes two pages.
   */
  room: 0 | 1 | 2;
  /** Rubrics left out so the issue fits its format (warned). */
  dropped: Array<RubricId | 'album'>;
  /** Pages of the photo story: as many as the photos allow, from four per page to spreads. */
  photoPages: number;
  /** Full-page quotes from the hero's answers and the friends' wishes, set between the rubrics. */
  posters: number;
  /** Last resort when nothing else is left: pages for the guests' wishes. */
  keepsakes: number;
}

/** Optional rubrics to leave out first when the issue does not fit its format. */
export const DROP_ORDER: ReadonlyArray<RubricId | 'album'> = ['album', 'places', 'blitz', 'people', 'horoscope', 'numbers'];

/**
 * Short, customer-facing hints: what would make the issue fuller, one per missing piece.
 * The preview shows them before the submit, the studio sees them with the layout version.
 */
export function materialHints(m: Materials, options: { target: number; skipped: ReadonlySet<RubricId>; contributions: number }): string[] {
  const out: string[] = [];
  const wanted = (id: RubricId) => !options.skipped.has(id);
  const big = options.target >= 36;

  const photos = m.photos('photos', 'gallery').length + Math.max(0, m.photos('photos', 'cover').length - 1);
  const [lo, hi] = big ? [10, 15] : [6, 10];
  if (wanted('photos')) {
    if (photos === 0) out.push(`Нет фото для разворотов «Фотосессии»: добавьте ${lo}–${hi} фото`);
    else if (photos < lo) out.push(`Мало фото для «Фотосессии»: добавьте ещё ${lo - photos}–${hi - photos}`);
  }
  if (wanted('friends') && options.contributions === 0) {
    out.push(big ? 'Друзья ещё не написали: отправьте им приглашение — каждому достанется своя страница' : 'Друзья ещё не написали: отправьте им приглашение — их истории войдут в рубрику «Говорят друзья»');
  }
  const interviewAnswers = ['bestStory', 'achievements', 'habits', 'childhood', 'lesson', 'turningPoint', 'work', 'touches', 'advice', 'dream'].filter((f) => m.text('interview', f)).length;
  if (interviewAnswers < 4) out.push('Короткое интервью: ответьте ещё на 2–3 вопроса в «Большом интервью»');
  const events = m.list('timeline', 'events').filter((e) => asText(e.year) && asText(e.title)).length;
  if (wanted('timeline')) {
    if (events === 0) out.push('Пустой раздел «Хронология»: добавьте 3–5 событий с годами');
    else if (events === 1) out.push('Для «Хронологии» нужно хотя бы два события');
  }
  if (wanted('rules') && m.list('rules', 'rules').filter((r) => asText(r.text)).length === 0) out.push('Пустой раздел «Правила жизни»: добавьте 3–5 правил героя');
  if (wanted('people') && m.list('people', 'people').filter((p) => asText(p.name)).length === 0) out.push('Пустой раздел «Близкий круг»: добавьте 2–4 человек с фото');
  if (wanted('places') && m.list('places', 'places').filter((p) => asText(p.name)).length === 0) out.push('Пустой раздел «Места силы»: добавьте 1–3 места с фото');
  if (wanted('thenNow') && m.photos('photos', 'childhood').length === 0) out.push('Нет детских фото для «Тогда и сейчас»: добавьте 1–3');
  const blitz = BLITZ_FIELDS.filter((f) => m.text('blitz', f)).length;
  if (wanted('blitz') && blitz < 3) out.push(blitz === 0 ? 'Пустой раздел «Блиц»: ответьте хотя бы на 3 коротких вопроса' : `В «Блице» ещё ${3 - blitz} ${plural(3 - blitz, ['ответ', 'ответа', 'ответов'])} до своей страницы`);
  const tastes = ['food', 'drink', 'music', 'film', 'place', 'phrase'].filter((f) => m.text('favorites', f)).length;
  if (wanted('tastes') && tastes < 3) out.push('Мало ответов в «Любимом»: заполните хотя бы три — получится страница вкусов');
  const facts = m.list('numbers', 'facts').filter((f) => asText(f.value) && asText(f.label)).length;
  if (wanted('numbers') && facts < 2) out.push('Пустой раздел «В цифрах»: добавьте 2–4 факта числом');
  if (wanted('letter') && !m.text('letter', 'text')) out.push('Нет письма герою: напишите пару абзацев от себя — ими закончится номер');
  if (wanted('dossier') && !['birthday', 'profession', 'city'].some((f) => m.text('hero', f))) out.push('Пустое «Досье»: укажите день рождения, город и чем занимается герой');
  return out;
}

export const BLITZ_FIELDS = ['owlOrLark', 'mountainsOrSea', 'pockets', 'superpower', 'weakness', 'dinnerGuest', 'karaoke', 'bestGift', 'happiness'] as const;
