import { A4, mm, type Box, type Page, type PhotoRef, type Size, type TextStyle } from '../domain/document';
import { asPhotos, asText } from '../domain/materials';
import type { Flowable, FontMetrics } from '../domain/text';
import { BlockFlow, Composer, editorialSections, paragraphs, type Template, type TemplateInput } from './template';

/**
 * MyGame: print files for a custom board game.
 *
 *  box lid · rules · character cards (one per player) · deck · card backs after every sheet (duplex)
 *  · game board (quiz 40×40 cm, city-tycoon 50×50 cm) · banknotes with players' faces (city-tycoon)
 *
 * Cards are 63×88 mm, imposed 3×3 on A4 sheets with crop marks; backs are mirrored for duplex printing.
 */
const YELLOW = '#ffd12e';
const TOMATO = '#ff4f2e';
const COBALT = '#2f5bff';
const MINT = '#2fd39a';
const INK = '#000000';
const PAPER = '#ffffff';
const ACCENTS = [YELLOW, TOMATO, COBALT, MINT];

const CARD: Size = { w: mm(63), h: mm(88) };
const SHEET_COLS = 3;
const SHEET_ROWS = 3;
const SHEET_ORIGIN = { x: (A4.w - CARD.w * SHEET_COLS) / 2, y: (A4.h - CARD.h * SHEET_ROWS) / 2 };
const MARGIN = mm(16);
const CONTENT: Box = { x: MARGIN, y: mm(20), w: A4.w - 2 * MARGIN, h: A4.h - mm(40) };

const BOARDS: Record<string, { size: number; perSide: number }> = {
  quiz: { size: mm(400), perSide: 9 },
  'city-tycoon': { size: mm(500), perSide: 9 },
};

const styles = {
  title: { font: 'unbounded-700', size: 30, leading: 1.05, color: INK } satisfies TextStyle,
  heading: { font: 'unbounded-700', size: 14, leading: 1.2, color: INK } satisfies TextStyle,
  body: { font: 'rubik-400', size: 10, leading: 1.45, color: INK, paragraphSpacing: 4 } satisfies TextStyle,
  bold: { font: 'rubik-600', size: 10, leading: 1.45, color: INK } satisfies TextStyle,
  cardTitle: { font: 'unbounded-700', size: 11, leading: 1.1, color: INK } satisfies TextStyle,
  cardText: { font: 'rubik-400', size: 9.5, leading: 1.35, color: INK } satisfies TextStyle,
  small: { font: 'rubik-600', size: 6.5, leading: 1.2, color: INK, tracking: 0.8, uppercase: true } satisfies TextStyle,
};

interface CardContent {
  kind: string;
  title: string;
  text: string;
  footer?: string;
  photo?: PhotoRef;
  accent: string;
}

const DEFAULT_RULES: Record<string, Array<{ heading: string; body: string }>> = {
  'conflict-cards': [
    { heading: 'Подготовка', body: 'Перемешайте колоду и положите её в центр рубашкой вверх. Раздайте каждому карту персонажа.' },
    { heading: 'Ход игры', body: 'Игрок тянет карту и читает её вслух. Если это вопрос — все одновременно показывают на того, кто подходит лучше всех. Если задание — выполняет тот, на кого выпало больше голосов.' },
    { heading: 'Победа', body: 'Карты, которые достались игроку, остаются у него. Через час или 30 карт побеждает тот, у кого карт меньше всех. Или больше — договоритесь заранее.' },
  ],
  quiz: [
    { heading: 'Подготовка', body: 'Положите поле в центр, фишки на «Старт», колоду вопросов рядом. Разделитесь на команды или играйте каждый за себя.' },
    { heading: 'Ход игры', body: 'Бросьте кубик и пройдите вперёд. Соперник справа тянет карту и читает вопрос. На ответ — время песочных часов. Ответили верно — бросаете ещё раз.' },
    { heading: 'Победа', body: 'Побеждает тот, кто первым пройдёт полный круг и ответит на финальный вопрос клетки «Старт».' },
  ],
  'city-tycoon': [
    { heading: 'Подготовка', body: 'Каждый игрок получает стартовый капитал купюрами с лицами друзей. Карточки собственности лежат у банкира, карточки «Шанс» — стопкой рубашкой вверх.' },
    { heading: 'Ход игры', body: 'Бросьте кубик и пройдите по полю. Свободное место можно купить по цене на клетке. На чужом месте платите аренду владельцу. На «Шансе» тяните карточку и выполняйте.' },
    { heading: 'Победа', body: 'Игра идёт, пока у всех кроме одного не закончатся деньги — или до конца вечера: тогда побеждает самый богатый.' },
  ],
};

export const boardgameTemplate: Template = {
  id: 'boardgame-kit@1',

  build(input: TemplateInput, metrics: FontMetrics) {
    const c = new Composer(input, metrics);
    const m = c.materials;
    const format = input.source.formatId;
    const gameName = input.draft.title || m.text('company', 'groupName') || input.source.subject;

    const players = m.list('players', 'players').map((p, i) => ({
      name: asText(p.name),
      nickname: asText(p.nickname),
      fame: asText(p.fame),
      photo: c.resolve(asPhotos(p.photo))[0],
      accent: ACCENTS[i % ACCENTS.length]!,
    })).filter((p) => p.name);
    const places = m.list('lore', 'places').map((p) => ({ name: asText(p.name), story: asText(p.story) })).filter((p) => p.name);

    // ---- Box lid ----
    const box = c.addPage('box', A4, YELLOW);
    c.rect(box, { x: mm(10), y: mm(10), w: A4.w - mm(20), h: A4.h - mm(20) }, undefined, { stroke: { color: INK, width: 3 }, radius: mm(6) });
    c.fit(box, gameName, { ...styles.title, size: 54, align: 'center' }, { x: MARGIN + mm(4), y: mm(36), w: CONTENT.w - mm(8), h: mm(70) }, { minSize: 24, maxLines: 3, verticalAlign: 'middle' });
    c.fit(box, input.draft.lead, { ...styles.body, size: 13, align: 'center' }, { x: MARGIN + mm(10), y: mm(112), w: CONTENT.w - mm(20), h: mm(36) }, { minSize: 9, maxLines: 5 });
    const faces = players.filter((p) => p.photo).slice(0, 12);
    const d = mm(30);
    const perRow = 4;
    faces.forEach((player, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, faces.length - row * perRow);
      const x = (A4.w - inRow * d - (inRow - 1) * mm(6)) / 2 + (i % perRow) * (d + mm(6));
      const y = mm(160) + row * (d + mm(12));
      c.rect(box, { x: x - mm(1.5), y: y - mm(1.5), w: d + mm(3), h: d + mm(3) }, player.accent, { radius: d });
      c.image(box, player.photo!, { x, y, w: d, h: d }, { shape: 'circle', stroke: { color: INK, width: 2 } });
      c.fit(box, player.nickname || player.name, { ...styles.small, align: 'center', size: 7 }, { x: x - mm(4), y: y + d + mm(2), w: d + mm(8), h: mm(6) }, { minSize: 5, maxLines: 2 });
    });
    c.fit(box, 'MyGame', { ...styles.heading, align: 'center' }, { x: MARGIN, y: A4.h - mm(30), w: CONTENT.w, h: mm(8) }, { minSize: 8, maxLines: 1 });

    // ---- Rules ----
    let rules = editorialSections(input, ['company', 'players', 'lore']);
    if (rules.length === 0 || input.draft.generator === 'template') {
      rules = DEFAULT_RULES[format] ?? DEFAULT_RULES['conflict-cards']!;
    }
    const rulesFlow = new BlockFlow(c, CONTENT, () => rulesPage(c));
    rulesFlow.block(mm(20), (page, y) => c.fit(page, 'Правила игры', styles.title, { x: MARGIN, y, w: CONTENT.w, h: mm(16) }, { minSize: 18, maxLines: 1 }));
    for (const [i, section] of rules.entries()) {
      rulesFlow.text([
        { text: section.heading, style: { ...styles.heading, color: i % 2 ? COBALT : TOMATO }, keepWithNext: true, spaceBefore: 14 },
        ...paragraphs(section.body).map((p, j): Flowable => ({ text: p, style: styles.body, spaceBefore: j === 0 ? 5 : 0 })),
      ]);
    }

    // ---- Cards ----
    const characters: CardContent[] = players.map((p) => ({
      kind: 'Персонаж',
      title: p.name,
      text: [p.nickname ? `«${p.nickname}»` : '', p.fame].filter(Boolean).join('\n'),
      photo: p.photo,
      accent: p.accent,
    }));
    const deck = deckCards(c, input, places, format);
    if (deck.length < 9) c.warn(`В колоде всего ${deck.length} карт: материалов мало, стоит дописать вопросы вручную`);
    const cards = [...characters, ...deck];
    for (let i = 0; i < cards.length; i += SHEET_COLS * SHEET_ROWS) {
      const sheet = cards.slice(i, i + SHEET_COLS * SHEET_ROWS);
      cardSheet(c, sheet);
      backSheet(c, sheet.length, gameName);
    }

    // ---- Board ----
    const board = BOARDS[format];
    if (board) gameBoard(c, board, format, gameName, places, players);

    // ---- Money ----
    if (format === 'city-tycoon') moneySheets(c, players, gameName);

    return c.document(gameName, boardgameTemplate.id);
  },
};

function rulesPage(c: Composer): Page {
  const page = c.addPage('rules', A4, PAPER);
  c.rect(page, { x: 0, y: 0, w: mm(6), h: A4.h }, YELLOW);
  return page;
}

function deckCards(c: Composer, input: TemplateInput, places: Array<{ name: string; story: string }>, format: string): CardContent[] {
  const fromDraft = input.draft.cards.map((card, i) => {
    const [question, answer] = card.text.split(/\s*Ответ:\s*/);
    return {
      kind: format === 'quiz' ? 'Вопрос' : format === 'city-tycoon' ? 'Шанс' : 'Конфликт',
      title: card.title,
      text: question ?? card.text,
      footer: answer ? `Ответ: ${answer}` : undefined,
      accent: ACCENTS[(i + 1) % ACCENTS.length]!,
    };
  });
  // The template generator returns contributions as cards; also take the raw quiz questions and jokes.
  const step = input.product.steps.find((s) => s.audience === 'contributor');
  const raw: CardContent[] = [];
  if (input.draft.generator === 'template' && step) {
    fromDraft.length = 0;
    for (const contribution of input.source.contributions) {
      const a = contribution.answers[step.id] ?? {};
      const question = asText(a.question);
      if (question) raw.push({ kind: 'Вопрос', title: `Спрашивает ${contribution.authorName}`, text: question, footer: asText(a.answer) ? `Ответ: ${asText(a.answer)}` : undefined, accent: COBALT });
      const story = asText(a.story);
      if (story) raw.push({ kind: 'История', title: contribution.authorName, text: story, accent: TOMATO });
    }
    for (const joke of c.materials.text('lore', 'jokes').split('\n').map((l) => l.trim()).filter(Boolean)) {
      raw.push({ kind: 'Мем', title: 'Мем', text: joke, accent: MINT });
    }
  }
  const properties: CardContent[] =
    format === 'city-tycoon'
      ? places.slice(0, 28).map((place, i) => ({
          kind: 'Собственность',
          title: place.name,
          text: place.story,
          footer: `Цена ${price(i)} · аренда ${Math.round(price(i) / 10)}`,
          accent: ACCENTS[Math.floor(i / 7) % ACCENTS.length]!,
        }))
      : [];
  return [...fromDraft, ...raw, ...properties];
}

function price(index: number): number {
  return 60 + index * 20;
}

function cardBox(index: number): Box {
  const col = index % SHEET_COLS;
  const row = Math.floor(index / SHEET_COLS);
  return { x: SHEET_ORIGIN.x + col * CARD.w, y: SHEET_ORIGIN.y + row * CARD.h, w: CARD.w, h: CARD.h };
}

function cropMarks(page: Page) {
  page.cropMarks = Array.from({ length: SHEET_COLS * SHEET_ROWS }, (_, i) => cardBox(i));
}

function cardSheet(c: Composer, cards: CardContent[]) {
  const page = c.addPage('cards', A4, PAPER);
  cropMarks(page);
  cards.forEach((card, i) => {
    const b = cardBox(i);
    const pad = mm(4);
    c.rect(page, b, PAPER, { stroke: { color: '#dddddd', width: 0.3 } });
    c.rect(page, { x: b.x + mm(2.5), y: b.y + mm(2.5), w: b.w - mm(5), h: b.h - mm(5) }, undefined, { stroke: { color: INK, width: 1.2 }, radius: mm(3) });
    c.rect(page, { x: b.x + mm(2.5), y: b.y + mm(2.5), w: b.w - mm(5), h: mm(9) }, card.accent, { radius: mm(3) });
    c.fit(page, card.kind, { ...styles.small, color: card.accent === COBALT ? PAPER : INK }, { x: b.x + pad, y: b.y + mm(5.3), w: b.w - 2 * pad, h: mm(4) }, { minSize: 5, maxLines: 1 });
    let y = b.y + mm(14);
    if (card.photo) {
      const d = mm(30);
      c.image(page, card.photo, { x: b.x + (b.w - d) / 2, y, w: d, h: d }, { shape: 'circle', stroke: { color: INK, width: 1.2 } });
      y += d + mm(3);
    }
    const used = c.fit(page, card.title, { ...styles.cardTitle, align: card.photo ? 'center' : 'left' }, { x: b.x + pad, y, w: b.w - 2 * pad, h: mm(12) }, { minSize: 7, maxLines: 2 });
    y += used + mm(2);
    const footerH = card.footer ? mm(9) : 0;
    c.fit(page, card.text, { ...styles.cardText, align: card.photo ? 'center' : 'left' }, { x: b.x + pad, y, w: b.w - 2 * pad, h: b.y + b.h - mm(5) - footerH - y }, { minSize: 6.5, maxLines: 12 });
    if (card.footer) {
      c.line(page, { x: b.x + pad, y: b.y + b.h - mm(5) - footerH }, { x: b.x + b.w - pad, y: b.y + b.h - mm(5) - footerH }, INK, 0.5);
      c.fit(page, card.footer, { font: 'rubik-600', size: 7.5, leading: 1.2, color: INK }, { x: b.x + pad, y: b.y + b.h - mm(4) - footerH + mm(1), w: b.w - 2 * pad, h: footerH - mm(1) }, { minSize: 5.5, maxLines: 2 });
    }
  });
}

/** Backs in mirrored order, so that after duplex printing (flip on the long edge) each back lands behind its front. */
function backSheet(c: Composer, count: number, gameName: string) {
  const page = c.addPage('card-backs', A4, PAPER);
  cropMarks(page);
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / SHEET_COLS);
    const col = SHEET_COLS - 1 - (i % SHEET_COLS);
    const b = cardBox(row * SHEET_COLS + col);
    c.rect(page, b, INK);
    c.rect(page, { x: b.x + mm(4), y: b.y + mm(4), w: b.w - mm(8), h: b.h - mm(8) }, YELLOW, { radius: mm(3) });
    c.fit(page, gameName, { ...styles.cardTitle, size: 14, align: 'center' }, { x: b.x + mm(7), y: b.y + mm(28), w: b.w - mm(14), h: mm(30) }, { minSize: 7, maxLines: 3, verticalAlign: 'middle' });
    c.fit(page, 'MyGame', { ...styles.small, align: 'center' }, { x: b.x, y: b.y + b.h - mm(12), w: b.w, h: mm(4) }, { minSize: 5, maxLines: 1 });
  }
}

function gameBoard(
  c: Composer,
  board: { size: number; perSide: number },
  format: string,
  gameName: string,
  places: Array<{ name: string; story: string }>,
  players: Array<{ name: string; photo?: PhotoRef; accent: string }>,
) {
  const S = board.size;
  const page = c.addPage('board', { w: S, h: S }, PAPER);
  const corner = S * 0.14;
  const n = board.perSide;
  const cell = (S - 2 * corner) / n;
  const squares = boardSquares(format, places, n * 4);
  if (format === 'city-tycoon' && places.length < 20) c.warn(`На поле ${places.length} ваших мест из 28: остальные клетки заполнены «Шансом»`);

  const corners = format === 'quiz' ? ['СТАРТ', 'Пропусти ход', 'Вопрос всем', 'Назад на 3'] : ['СТАРТ', 'Отдел кадров', 'Бесплатная парковка', 'Иди в отдел кадров'];
  const cornerBoxes: Box[] = [
    { x: S - corner, y: S - corner, w: corner, h: corner },
    { x: 0, y: S - corner, w: corner, h: corner },
    { x: 0, y: 0, w: corner, h: corner },
    { x: S - corner, y: 0, w: corner, h: corner },
  ];
  cornerBoxes.forEach((b, i) => {
    c.rect(page, b, i === 0 ? YELLOW : PAPER, { stroke: { color: INK, width: 2 } });
    c.fit(page, corners[i]!, { ...styles.heading, size: 22, align: 'center' }, { x: b.x + mm(4), y: b.y + mm(4), w: b.w - mm(8), h: b.h - mm(8) }, { minSize: 10, maxLines: 3, verticalAlign: 'middle' });
  });

  // Squares go counter-clockwise from START (bottom right): bottom, left, top, right.
  for (let i = 0; i < n * 4; i++) {
    const side = Math.floor(i / n);
    const k = i % n;
    const b: Box =
      side === 0
        ? { x: S - corner - (k + 1) * cell, y: S - corner, w: cell, h: corner }
        : side === 1
          ? { x: 0, y: S - corner - (k + 1) * cell, w: corner, h: cell }
          : side === 2
            ? { x: corner + k * cell, y: 0, w: cell, h: corner }
            : { x: S - corner, y: corner + k * cell, w: corner, h: cell };
    const square = squares[i]!;
    c.rect(page, b, PAPER, { stroke: { color: INK, width: 1.2 } });
    const band = side === 0 ? { x: b.x, y: b.y, w: b.w, h: b.h * 0.22 } : side === 1 ? { x: b.x + b.w * 0.78, y: b.y, w: b.w * 0.22, h: b.h } : side === 2 ? { x: b.x, y: b.y + b.h * 0.78, w: b.w, h: b.h * 0.22 } : { x: b.x, y: b.y, w: b.w * 0.22, h: b.h };
    c.rect(page, band, square.accent, { stroke: { color: INK, width: 1.2 } });
    const textBox = side === 0 ? { x: b.x + mm(2), y: b.y + b.h * 0.25, w: b.w - mm(4), h: b.h * 0.72 } : side === 1 ? { x: b.x + mm(2), y: b.y + mm(2), w: b.w * 0.74, h: b.h - mm(4) } : side === 2 ? { x: b.x + mm(2), y: b.y + mm(2), w: b.w - mm(4), h: b.h * 0.74 } : { x: b.x + b.w * 0.24, y: b.y + mm(2), w: b.w * 0.74, h: b.h - mm(4) };
    c.fit(page, square.title, { ...styles.cardTitle, size: 12, align: 'center' }, { ...textBox, h: textBox.h * 0.6 }, { minSize: 6, maxLines: 3, verticalAlign: 'middle' });
    if (square.sub) c.fit(page, square.sub, { ...styles.cardText, size: 8, align: 'center' }, { ...textBox, y: textBox.y + textBox.h * 0.62, h: textBox.h * 0.38 }, { minSize: 5.5, maxLines: 2 });
  }

  // Centre: title and the players' faces.
  const inner = { x: corner, y: corner, w: S - 2 * corner, h: S - 2 * corner };
  c.rect(page, inner, YELLOW);
  c.fit(page, gameName, { ...styles.title, size: 72, align: 'center' }, { x: inner.x + mm(20), y: inner.y + mm(30), w: inner.w - mm(40), h: inner.h * 0.35 }, { minSize: 28, maxLines: 3, verticalAlign: 'middle' });
  const faces = players.filter((p) => p.photo).slice(0, 10);
  const d = Math.min(mm(42), (inner.w - mm(40)) / Math.max(1, Math.min(5, faces.length)) - mm(6));
  faces.forEach((player, i) => {
    const row = Math.floor(i / 5);
    const inRow = Math.min(5, faces.length - row * 5);
    const x = inner.x + (inner.w - inRow * d - (inRow - 1) * mm(6)) / 2 + (i % 5) * (d + mm(6));
    const y = inner.y + inner.h * 0.5 + row * (d + mm(8));
    c.image(page, player.photo!, { x, y, w: d, h: d }, { shape: 'circle', stroke: { color: INK, width: 2.5 } });
  });
}

function boardSquares(format: string, places: Array<{ name: string; story: string }>, count: number) {
  const out: Array<{ title: string; sub?: string; accent: string }> = [];
  if (format === 'city-tycoon') {
    let placeIndex = 0;
    for (let i = 0; i < count; i++) {
      // Every fifth square is a «Шанс»; the rest are the company's places, grouped by colour.
      const place = i % 5 === 2 ? undefined : places[placeIndex];
      if (place) {
        out.push({ title: place.name, sub: `${price(placeIndex)} ₸`, accent: ACCENTS[Math.floor(placeIndex / 7) % ACCENTS.length]! });
        placeIndex++;
      } else {
        out.push({ title: 'Шанс', sub: 'тяни карточку', accent: PAPER });
      }
    }
    return out;
  }
  const kinds = [
    { title: 'Вопрос', sub: 'про игроков', accent: YELLOW },
    { title: 'Вопрос', sub: 'про места', accent: COBALT },
    { title: 'Мем', sub: 'объясни мем', accent: MINT },
    { title: 'Вопрос', sub: 'кто это сказал?', accent: TOMATO },
  ];
  for (let i = 0; i < count; i++) {
    const place = places[i];
    out.push(i % 4 === 1 && place ? { title: place.name, sub: 'вопрос про это место', accent: COBALT } : kinds[i % kinds.length]!);
  }
  return out;
}

function moneySheets(c: Composer, players: Array<{ name: string; photo?: PhotoRef; accent: string }>, gameName: string) {
  const notes = [500, 100, 50, 20, 10, 5];
  const size = { w: mm(150), h: mm(64) };
  const perPage = 4;
  for (let start = 0; start < notes.length; start += perPage) {
    const page = c.addPage('money', A4, PAPER);
    const boxes = notes.slice(start, start + perPage).map((_, i) => ({ x: (A4.w - size.w) / 2, y: mm(14) + i * (size.h + mm(4)), ...size }));
    page.cropMarks = boxes;
    notes.slice(start, start + perPage).forEach((value, i) => {
      const b = boxes[i]!;
      const player = players[(start + i) % Math.max(1, players.length)];
      const accent = ACCENTS[(start + i) % ACCENTS.length]!;
      c.rect(page, b, accent);
      c.rect(page, { x: b.x + mm(3), y: b.y + mm(3), w: b.w - mm(6), h: b.h - mm(6) }, undefined, { stroke: { color: INK, width: 1.2 }, radius: mm(2) });
      c.fit(page, String(value), { ...styles.title, size: 40 }, { x: b.x + mm(8), y: b.y + mm(8), w: mm(50), h: mm(20) }, { minSize: 16, maxLines: 1 });
      c.fit(page, String(value), { ...styles.heading, align: 'right' }, { x: b.x + b.w - mm(48), y: b.y + b.h - mm(16), w: mm(40), h: mm(9) }, { minSize: 8, maxLines: 1 });
      c.fit(page, gameName, { ...styles.small, size: 7 }, { x: b.x + mm(8), y: b.y + b.h - mm(14), w: mm(70), h: mm(6) }, { minSize: 5, maxLines: 1 });
      const d = mm(40);
      const faceX = b.x + (b.w - d) / 2 + mm(12);
      if (player?.photo) c.image(page, player.photo, { x: faceX, y: b.y + mm(6), w: d, h: d }, { shape: 'circle', stroke: { color: INK, width: 1.5 } });
      if (player) c.fit(page, player.name, { ...styles.small, align: 'center' }, { x: faceX - mm(4), y: b.y + mm(48), w: d + mm(8), h: mm(4) }, { minSize: 5, maxLines: 1 });
    });
  }
}
