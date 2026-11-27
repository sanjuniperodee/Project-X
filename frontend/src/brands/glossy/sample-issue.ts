/**
 * The sample issue shown on the landing: real pages typeset by the layout service
 * (template glossy-magazine@2) from a demo questionnaire, rasterised from the print PDF.
 * Photos: Unsplash (Unsplash License). Regenerate the files when the template changes.
 */
export interface SamplePage {
  number: number;
  src: string;
  rubric: string;
}

const RUBRICS = [
  'Обложка',
  'Содержание',
  'Письмо редактора',
  'Досье',
  'Большое интервью',
  'Большое интервью',
  'Вкусы героя',
  'Хронология',
  'В цифрах',
  'Тогда и сейчас',
  'Правила жизни',
  'Говорят друзья',
  'Говорят друзья',
  'Говорят друзья',
  'Говорят друзья',
  'Одним словом',
  'Очерк',
  'Фотосессия',
  'Фотосессия',
  'Пожелание друга',
  'Фотосессия',
  'Пожелание друга',
  'Пожелания гостей',
  'Задняя обложка',
];

export const SAMPLE_PAGE_SIZE = { width: 910, height: 1287 };

export const SAMPLE_PAGES: SamplePage[] = RUBRICS.map((rubric, i) => ({
  number: i + 1,
  rubric,
  src: `/coverme/issue/${String(i + 1).padStart(2, '0')}.webp`,
}));

export function samplePage(number: number): SamplePage {
  return SAMPLE_PAGES[number - 1]!;
}

/** Pages as a printed magazine opens: the cover alone, pairs of facing pages, the back cover alone. */
export function sampleSpreads(): SamplePage[][] {
  const pages = SAMPLE_PAGES;
  const spreads: SamplePage[][] = [[pages[0]!]];
  for (let i = 1; i < pages.length - 1; i += 2) spreads.push(pages.slice(i, Math.min(i + 2, pages.length - 1)));
  spreads.push([pages.at(-1)!]);
  return spreads;
}
