import jpeg from 'jpeg-js';
import { Product, type LayoutSource, type ProductInput } from '@px/contracts';
import { glossy } from '../../../catalog/src/products/glossy';
import { shezhire } from '../../../catalog/src/products/shezhire';
import { boardgame } from '../../../catalog/src/products/boardgame';
import type { MediaGateway } from '../../src/application/ports';

export const products = {
  glossy: Product.parse(glossy satisfies ProductInput),
  shezhire: Product.parse(shezhire satisfies ProductInput),
  boardgame: Product.parse(boardgame satisfies ProductInput),
};

/** A JPEG with a colour gradient, `w`×`h` pixels, optionally with an EXIF orientation. */
export function fakeJpeg(w: number, h: number, seed = 0): Buffer {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = (x * 255) / w;
      data[i + 1] = ((y * 255) / h + seed * 40) % 255;
      data[i + 2] = (seed * 70) % 255;
      data[i + 3] = 255;
    }
  }
  return jpeg.encode({ width: w, height: h, data }, 80).data;
}

/** In-memory media: photos by key, stored files collected for assertions. */
export class FakeMedia implements MediaGateway {
  readonly files = new Map<string, Buffer>();
  readonly stored = new Map<string, { contentType: string; size: number }>();

  constructor(photos: Record<string, Buffer> = {}) {
    for (const [key, data] of Object.entries(photos)) this.files.set(key, data);
  }

  async download(key: string, file: string) {
    const data = this.files.get(key);
    if (!data) return false;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, data);
    return true;
  }

  async get(key: string) {
    return this.files.get(key) ?? null;
  }

  async put(key: string, body: Buffer | { file: string }, contentType: string) {
    const { readFile } = await import('node:fs/promises');
    const data = Buffer.isBuffer(body) ? body : await readFile(body.file);
    this.files.set(key, data);
    this.stored.set(key, { contentType, size: data.length });
    return `/api/media/files/${key}`;
  }
}

const photo = (id: string) => ({ id, url: `/api/media/files/${id}.jpg` });
const photos = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => photo(`${prefix}${i}`));

export function photoFiles(ids: string[], size: [number, number] = [900, 1200]): Record<string, Buffer> {
  return Object.fromEntries(ids.map((id, i) => [`${id}.jpg`, fakeJpeg(i % 3 === 0 ? size[1] : size[0], i % 3 === 0 ? size[0] : size[1], i)]));
}

const longStory =
  'Мы познакомились на первом курсе, когда Айгерим опоздала на пару и, вместо того чтобы тихо сесть сзади, громко поздоровалась со всей аудиторией. Преподаватель растерялся, а мы поняли, что с этим человеком скучно не будет никогда. С тех пор было всё: поездка на Кольсай без палатки, ночные разговоры о будущем, первый бизнес с выпечкой на заказ.';

export function glossySource(): LayoutSource {
  return {
    projectId: 'p-glossy',
    productId: 'glossy',
    subject: 'Айгерим',
    formatId: 'a4-24',
    status: 'in_design',
    designMode: 'auto',
    nextVersion: 1,
    answers: {
      hero: { heroName: 'Айгерим', occasion: 'birthday', eventDate: '2026-12-12', birthday: '1996-12-12', profession: 'Основательница кофейни «Дәм»', city: 'Алматы', tone: 'vogue' },
      interview: { threeWords: 'Смелая, смешная, упрямая', bestStory: longStory, achievements: 'Открыла кофейню в 25 лет', childhood: 'Строила шалаши во дворе и командовала всеми мальчишками.', lesson: 'Если страшно — значит, надо делать.', dream: 'Объехать Казахстан на автодоме' },
      favorites: { food: 'Мамин бешбармак', drink: 'Флэт уайт на овсяном', music: 'Ninety One', film: '«Друзья»', place: 'Кок-Жайляу на рассвете', phrase: 'Ну давайте уже!' },
      timeline: { events: [
        { year: '1996', title: 'Родилась в Караганде, в самую снежную зиму десятилетия', photo: [photo('t0')] },
        { year: '2014', title: 'Переехала в Алматы с одним чемоданом' },
        { year: '2018', title: 'Диплом экономиста и первая поездка в горы', photo: [photo('t1')] },
        { year: '2021', title: 'Открыла кофейню «Дәм»' },
        { year: '2024', title: 'Пробежала первый марафон' },
      ] },
      numbers: { facts: [
        { value: '17', label: 'стран, где она пробовала местный кофе' },
        { value: '3200', label: 'чашек флэт уайта сварено своими руками' },
        { value: '42', label: 'км марафона без единой остановки' },
        { value: '0', label: 'опозданий на плов' },
      ] },
      rules: { rules: [{ text: 'Никогда не опаздывать на плов' }, { text: 'Говорить правду, даже когда неудобно' }, { text: 'Каждое лето — новые горы' }] },
      photos: { cover: [photo('cover0')], childhood: [photo('k0')], gallery: photos('g', 14) },
    },
    contributions: [
      { id: 'c1', authorName: 'Әсел Нұрланқызы', answers: { insight: { relation: 'Подруга с первого курса', oneWord: 'Ураган', story: longStory, wish: 'Оставайся такой же громкой!', photos: [photo('f0')] } }, createdAt: '2026-11-01T10:00:00.000Z' },
      { id: 'c2', authorName: 'Ерлан', answers: { insight: { relation: 'Брат', oneWord: 'Стена', story: 'Она научила меня ездить на велосипеде и ни разу не призналась, что сама боялась.', photos: [photo('f1'), photo('f2')] } }, createdAt: '2026-11-02T10:00:00.000Z' },
    ],
  };
}

export const glossyDraft = {
  title: 'Айгерим: женщина, которая не опаздывает на плов',
  lead: 'Этот номер мы собирали втайне. Друзья, брат и коллеги рассказали о ней то, что она никогда не расскажет сама.',
  sections: [
    { heading: 'Большое интервью', body: `${longStory}\n\n${longStory}\n\n${longStory}\n\n${longStory}` },
    { heading: 'Правила жизни', body: 'Никогда не опаздывать на плов\nГоворить правду, даже когда неудобно\nКаждое лето — новые горы\nСемья важнее работы' },
    { heading: 'Инсайды от друзей', body: 'Әсел: «громкая»' },
  ],
  cards: [
    { title: 'Секрет её кофейни', text: 'Почему очередь стоит с семи утра' },
    { title: 'Правила жизни', text: 'Четыре принципа, которые работают' },
    { title: 'Друзья рассказали всё', text: 'Истории, которые она просила не печатать' },
  ],
  generator: 'claude:test',
  generatedAt: '2026-11-20T10:00:00.000Z',
};

export function shezhireSource(): LayoutSource {
  const members = [
    { fullName: 'Сейткали Жақыпұлы', generation: 'great-grandparents', line: 'paternal', years: '1901–1972', bio: 'Табунщик, пережил голод тридцатых, вырастил семерых детей.', photos: [photo('m0')] },
    { fullName: 'Ғалия Сейткалиқызы', generation: 'grandparents', line: 'paternal', years: '1931–2012', bio: longStory, photos: [photo('m1'), photo('m2')] },
    { fullName: 'Нұрлан', generation: 'grandparents', line: 'maternal', years: '1929–1999', bio: '' },
    { fullName: 'Марат Сейткалиев', generation: 'parents', line: 'paternal', years: '1958', bio: 'Инженер-строитель.' },
    { fullName: 'Айнұр', generation: 'parents', line: 'maternal', years: '1961', bio: 'Учительница казахского языка.' },
    { fullName: 'Динара', generation: 'self', years: '1988', bio: 'Собрала эту книгу.' },
    { fullName: 'Алихан', generation: 'children', years: '2015', bio: '' },
  ];
  return {
    projectId: 'p-shezhire',
    productId: 'shezhire',
    subject: 'Сейткалиевы',
    formatId: 'book',
    status: 'in_design',
    designMode: 'auto',
    nextVersion: 1,
    answers: {
      family: { familyName: 'Сейткалиевы', ru: 'Арғын, Орта жүз', homeland: 'Қарқаралы', dedication: 'Нашим детям — чтобы помнили.' },
      tree: { members },
      stories: { stories: [{ title: 'Переезд в Караганду', period: '1950-е', text: longStory }] },
      archive: { archive: photos('a', 5) },
    },
    contributions: [
      { id: 'c1', authorName: 'Сауле', answers: { memories: { relation: 'Внучка Галии апа', aboutWhom: 'Галие апа', story: longStory, photos: [photo('r0')] } }, createdAt: '2026-11-01T10:00:00.000Z' },
    ],
  };
}

export const shezhireDraft = {
  title: 'Шежіре рода Сейткалиевых',
  lead: 'Эта книга — о людях, без которых нас бы не было.',
  sections: [{ heading: 'Корни', body: `${longStory}\n\n${longStory}` }],
  cards: [{ title: 'Нұрлан (1929–1999)', text: 'Шофёр, первым в ауле купил мотоцикл.' }],
  generator: 'claude:test',
  generatedAt: '2026-11-20T10:00:00.000Z',
};

export function boardgameSource(formatId = 'city-tycoon'): LayoutSource {
  return {
    projectId: 'p-game',
    productId: 'boardgame',
    subject: 'Акулы',
    formatId,
    status: 'in_design',
    designMode: 'auto',
    nextVersion: 1,
    answers: {
      company: { groupName: 'Отдел продаж «Акулы»', groupType: 'office', tone: 'roast' },
      players: { players: ['Ерлан', 'Мадина', 'Әлібек', 'Жанар', 'Тимур'].map((name, i) => ({ name, nickname: `Мистер ${i}`, fame: 'Знаменит тем, что всегда приходит с пиццей', photo: [photo(`p${i}`)] })) },
      lore: { places: ['Кофейня у офиса', 'Переговорка «Алатау»', 'Парковка', 'Столовая', 'Курилка', 'Кухня', 'Лифт'].map((name) => ({ name, story: 'Тут всё и началось' })), jokes: 'Дедлайн вчера\nКто взял мою кружку?' },
    },
    contributions: [
      { id: 'c1', authorName: 'Мадина', answers: { contribution: { story: 'Пицца в 3 ночи перед квартальным отчётом', question: 'Кто уснул на корпоративе в 2023?', answer: 'Тимур' } }, createdAt: '2026-11-01T10:00:00.000Z' },
    ],
  };
}

export const boardgameDraft = {
  title: 'Акулы: игра на выживание',
  lead: 'Настольная игра про отдел, который продаёт всё.',
  sections: [
    { heading: 'Подготовка', body: 'Разложите поле, раздайте деньги.' },
    { heading: 'Ход игры', body: 'Бросайте кубик и покупайте места.' },
  ],
  cards: Array.from({ length: 14 }, (_, i) => ({ title: `Шанс ${i + 1}`, text: 'Вы забыли отправить отчёт. Заплатите 50 за кофе всему отделу. Ответ: Тимур' })),
  generator: 'claude:test',
  generatedAt: '2026-11-20T10:00:00.000Z',
};
