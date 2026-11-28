import { A4, BLEED, mm, type Box, type PhotoRef } from '../domain/document';
import type { Flowable } from '../domain/text';
import { CONTENT, folio, GUTTER, kicker, MARGIN, TOP, BOTTOM, type Issue, type Styles } from './glossy-kit';
import { paragraphs, photoGrid, type Composer } from './template';

/**
 * Cover Me rubrics added for the fuller issue (blitz, close circle, places, family album, the customer's
 * letter), the full-page posters made of the hero's own words and the photo spreads.
 */

type Rubric = { title: string; deck: string };

/** Rubric header on the first page: kicker, headline, deck. Returns the y where the content starts. */
function header(c: Composer, s: Styles, page: ReturnType<Composer['addPage']>, label: string, r: Rubric, width = CONTENT.w): number {
  kicker(c, s, page, label, { x: MARGIN, y: TOP, w: width, h: mm(5) });
  const used = c.fit(page, r.title, s.headline, { x: MARGIN, y: TOP + mm(8), w: width, h: mm(40) }, { minSize: 26, maxLines: 2 });
  const deckUsed = r.deck ? c.fit(page, r.deck, s.deck, { x: MARGIN, y: TOP + mm(11) + used, w: width, h: mm(14) }, { minSize: 10, maxLines: 2 }) : 0;
  return TOP + mm(22) + used + deckUsed;
}

/** «Блиц»: short questions and quick answers in two columns, like the last page of an interview. */
export function blitzPage(c: Composer, s: Styles, issue: Issue, r: Rubric, items: Array<{ question: string; answer: string }>) {
  const t = s.t;
  const page = c.addPage('blitz', A4, t.soft);
  const top = header(c, s, page, 'Блиц', r);
  const list = items.slice(0, 10);
  const rows = Math.ceil(list.length / 2);
  const cellW = (CONTENT.w - GUTTER * 2) / 2;
  const cellH = Math.min(mm(56), (A4.h - BOTTOM - top) / rows);
  list.forEach((item, i) => {
    const x = MARGIN + (i % 2) * (cellW + GUTTER * 2);
    const y = top + Math.floor(i / 2) * cellH;
    c.rect(page, { x, y, w: mm(10), h: 2 }, t.accent);
    const q = c.fit(page, item.question, { ...s.label, color: t.accent }, { x, y: y + mm(4), w: cellW, h: mm(8) }, { minSize: 5, maxLines: 2 });
    c.fit(page, item.answer, { font: t.fonts.serifItalic, size: 22, leading: 1.15, color: t.ink, uppercase: t.cover === 'tabloid' }, { x, y: y + mm(6) + q, w: cellW, h: cellH - q - mm(10) }, { minSize: 11, maxLines: 4, verticalAlign: 'top' });
  });
  folio(c, s, page, issue);
}

export interface Person {
  name: string;
  who: string;
  about: string;
  photo?: PhotoRef;
}

/** «Близкий круг»: portraits of the people closest to the hero, four to a page (two when there is room). */
export function peoplePages(c: Composer, s: Styles, issue: Issue, r: Rubric, people: Person[], room: boolean) {
  const t = s.t;
  const perPage = room ? 2 : 4;
  for (let start = 0; start < people.length; start += perPage) {
    const page = c.addPage('people', A4, t.paper);
    const top = start === 0 ? header(c, s, page, 'Близкий круг', r) : TOP;
    const group = people.slice(start, start + perPage);
    const area: Box = { x: MARGIN, y: top, w: CONTENT.w, h: A4.h - BOTTOM - top };
    // One or two people on a page get a row each, photo beside the words; four share a two-by-two grid.
    const wide = room || group.length <= 2;
    const rows = wide ? group.length : 2;
    const cellH = (area.h - GUTTER * (rows - 1)) / rows;
    group.forEach((person, i) => {
      const cellW = wide ? area.w : (area.w - GUTTER) / 2;
      const x = wide ? area.x : area.x + (i % 2) * (cellW + GUTTER);
      const y = area.y + (wide ? i : Math.floor(i / 2)) * (cellH + GUTTER);
      // Wide: photo on the left, words on the right. Grid: photo on top, words below.
      const photoBox: Box = wide ? { x, y, w: cellW * 0.46, h: Math.min(cellH, mm(150)) } : { x, y, w: cellW, h: cellH * 0.56 };
      const textBox: Box = wide ? { x: x + cellW * 0.46 + GUTTER, y: y + mm(4), w: cellW * 0.54 - GUTTER, h: cellH - mm(4) } : { x, y: y + cellH * 0.56 + mm(4), w: cellW, h: cellH * 0.44 - mm(4) };
      if (person.photo) {
        if (t.portraitShape === 'circle') {
          const d = Math.min(photoBox.w, photoBox.h);
          c.image(page, person.photo, { x: photoBox.x + (photoBox.w - d) / 2, y: photoBox.y, w: d, h: d }, { shape: 'circle', focusY: 0.3 });
        } else c.image(page, person.photo, photoBox, { focusY: 0.3 });
      } else {
        c.rect(page, photoBox, t.panel);
        c.fit(page, person.name.charAt(0), { font: t.fonts.display, size: 96, leading: 1, color: t.accent, align: 'center', uppercase: true }, { x: photoBox.x, y: photoBox.y + photoBox.h / 2 - mm(16), w: photoBox.w, h: mm(32) }, { minSize: 30, maxLines: 1 });
      }
      const nameH = c.fit(page, person.name, s.author, { ...textBox, h: mm(12) }, { minSize: 10, maxLines: 2 });
      const whoH = person.who ? c.fit(page, person.who, { ...s.label, color: t.accent }, { ...textBox, y: textBox.y + nameH + mm(1.5), h: mm(4) }, { minSize: 5, maxLines: 1 }) + mm(1.5) : 0;
      const aboutY = textBox.y + nameH + whoH + mm(3);
      if (person.about) c.fit(page, person.about, wide ? { ...s.lede, size: s.lede.size * 0.95 } : { ...s.body, size: s.body.size * 1.05 }, { ...textBox, y: aboutY, h: textBox.y + textBox.h - aboutY }, { minSize: 7, maxLines: wide ? 10 : 5, verticalAlign: 'top' });
    });
    folio(c, s, page, issue);
  }
}

export interface Place {
  name: string;
  story: string;
  photos: PhotoRef[];
}

/** «Места силы»: a travel page per one or two places, a wide photo over the place's story. */
export function placesPages(c: Composer, s: Styles, issue: Issue, r: Rubric, places: Place[], room: boolean) {
  const t = s.t;
  const perPage = room ? 1 : 2;
  for (let start = 0; start < places.length; start += perPage) {
    const page = c.addPage('places', A4, t.paper);
    const top = start === 0 ? header(c, s, page, 'Места силы', r) : TOP;
    const group = places.slice(start, start + perPage);
    // A place alone on the last page takes the whole page rather than leaving half of it empty.
    const blockH = (A4.h - BOTTOM - top - GUTTER * (group.length - 1)) / group.length;
    group.forEach((place, i) => {
      const y = top + i * (blockH + GUTTER);
      const [main, second] = place.photos;
      const photoH = main ? blockH * (group.length === 1 ? 0.62 : 0.58) : 0;
      if (main) {
        const mainW = second ? CONTENT.w * 0.64 : CONTENT.w;
        c.image(page, main, { x: MARGIN, y, w: mainW, h: photoH });
        if (second) c.image(page, second, { x: MARGIN + mainW + GUTTER, y, w: CONTENT.w - mainW - GUTTER, h: photoH }, { focusY: 0.4 });
      }
      const textY = y + photoH + (main ? mm(5) : 0);
      const nameH = c.fit(page, place.name, { font: t.fonts.display, size: 30, leading: 1.02, color: t.ink, uppercase: t.headlineUppercase }, { x: MARGIN, y: textY, w: CONTENT.w, h: mm(14) }, { minSize: 14, maxLines: 1 });
      if (place.story) {
        const storyY = textY + nameH + mm(3);
        c.fit(page, place.story, { ...s.lede, size: s.lede.size * (group.length === 1 ? 1.05 : 0.9) }, { x: MARGIN, y: storyY, w: CONTENT.w * 0.86, h: y + blockH - storyY }, { minSize: 8, maxLines: group.length === 1 ? 12 : 6, verticalAlign: 'top' });
      }
    });
    folio(c, s, page, issue);
  }
}

/** «Семейный альбом»: the childhood photos that did not go to «Тогда и сейчас», on one page. */
export function albumPage(c: Composer, s: Styles, issue: Issue, r: Rubric, photos: PhotoRef[]) {
  const t = s.t;
  const page = c.addPage('album', A4, t.panel);
  const top = header(c, s, page, 'Из семейного альбома', r);
  const frame: Box = { x: MARGIN, y: top, w: CONTENT.w, h: A4.h - BOTTOM - top - mm(4) };
  const boxes = photoGrid(frame, photos.length, mm(4));
  photos.forEach((photo, i) => {
    const box = boxes[i]!;
    // A white print border, like a photo glued into an album.
    c.rect(page, box, t.card);
    c.image(page, photo, { x: box.x + mm(2.5), y: box.y + mm(2.5), w: box.w - mm(5), h: box.h - mm(5) }, { focusY: 0.35 });
  });
  folio(c, s, page, issue);
}

/** «Письмо герою»: the customer's own text, set as a letter with their signature; closes the issue. */
export function heroLetterPages(c: Composer, s: Styles, issue: Issue, r: Rubric, letter: { text: string; signature: string }, photo: PhotoRef | undefined) {
  const t = s.t;
  const page = c.addPage('hero-letter', A4, t.paper);
  let top = TOP;
  if (photo && t.portraitShape === 'circle') {
    const d = mm(84);
    c.image(page, photo, { x: (A4.w - d) / 2, y: TOP, w: d, h: d }, { shape: 'circle', focusY: 0.3 });
    top = TOP + d + mm(10);
  } else if (photo) {
    const h = mm(112);
    c.image(page, photo, { x: -BLEED, y: -BLEED, w: A4.w + 2 * BLEED, h: h + BLEED }, { focusY: 0.3 });
    top = h + mm(10);
  }
  kicker(c, s, page, r.title || 'Письмо герою', { x: MARGIN, y: top, w: CONTENT.w, h: mm(5) });
  const used = c.fit(page, `${issue.hero},`, { ...s.headline, size: photo ? 40 : 54 }, { x: MARGIN, y: top + mm(7), w: CONTENT.w, h: mm(24) }, { minSize: 22, maxLines: 1 });
  const width = CONTENT.w * 0.86;
  const style = { ...s.lede, size: s.lede.size * (photo ? 1 : 1.12), leading: 1.5, paragraphSpacing: 7 };
  const flowables: Flowable[] = [
    ...paragraphs(letter.text).map((p) => ({ text: p, style })),
    ...(letter.signature ? [{ text: letter.signature, style: { font: t.fonts.displayItalic, size: 22, leading: 1.2, color: t.accent, align: 'right' as const }, spaceBefore: 12 }] : []),
  ];
  const story = c.story(flowables, width);
  const textTop = top + mm(13) + used;
  c.flow(page, story, [{ x: MARGIN, y: textTop, w: width, h: A4.h - BOTTOM - textTop }]);
  folio(c, s, page, issue);
  while (!story.done) {
    const next = c.addPage('hero-letter', A4, t.paper);
    c.flow(next, story, [{ x: MARGIN, y: TOP, w: width, h: CONTENT.h }]);
    folio(c, s, next, issue);
  }
}

/** A full-page poster made of the hero's or a friend's own words. */
export type Poster =
  | { kind: 'quote'; text: string; author: string; anchor: string; own: boolean }
  | { kind: 'words'; words: string[]; anchor: string; own: boolean };

export function posterPage(c: Composer, s: Styles, issue: Issue, poster: Poster, dark: boolean) {
  if (poster.kind === 'quote') return quotePage(c, s, poster, dark);
  // Manifesto: the three words about the hero, one per line, as large as the page allows.
  const t = s.t;
  const bg = dark ? t.dark : t.accent;
  const ink = dark ? t.onDark : t.onAccent;
  const second = dark ? t.darkAccent : t.cover === 'tabloid' ? t.soft : t.cover === 'noir' ? t.paper : t.ink;
  const page = c.addPage('manifesto', A4, bg);
  kicker(c, s, page, `${issue.hero} в трёх словах`, { x: MARGIN, y: TOP, w: CONTENT.w, h: mm(5) }, t.kicker === 'bar' ? '#000000' : ink);
  const words = poster.words.slice(0, 4);
  const top = TOP + mm(30);
  const rowH = (A4.h - BOTTOM - mm(10) - top) / words.length;
  words.forEach((word, i) => {
    c.fit(page, word, { font: i % 2 === 0 ? t.fonts.display : t.fonts.displayItalic, size: 110, leading: 1, color: i % 2 === 0 ? ink : second, align: i % 2 === 0 ? 'left' : 'right', uppercase: t.headlineUppercase }, { x: MARGIN, y: top + i * rowH, w: CONTENT.w, h: rowH * 0.9 }, { minSize: 28, maxLines: 1, verticalAlign: 'middle' });
  });
  folio(c, s, page, undefined, undefined, dark ? t.darkRule : ink);
}

export function quotePage(c: Composer, s: Styles, quote: { text: string; author: string }, dark: boolean) {
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

/**
 * One photo across two facing pages. Called on a left-hand (even) page: the same photo is drawn on both
 * pages, positioned over the whole spread and clipped to each page with its outer bleed.
 */
export function spreadPages(c: Composer, s: Styles, photo: PhotoRef) {
  const W = 2 * A4.w + 2 * BLEED;
  const H = A4.h + 2 * BLEED;
  const scale = Math.max(W / photo.width, H / photo.height);
  const w = photo.width * scale;
  const h = photo.height * scale;
  const crop: Box = { x: -BLEED + (W - w) / 2, y: -BLEED + (H - h) * 0.4, w, h };
  // Each half runs into the bleed on the spine side too, so no edge shows if the fold is a hair off.
  const left = c.addPage('spread', A4, s.t.shadow);
  c.image(left, photo, { x: -BLEED, y: -BLEED, w: A4.w + 2 * BLEED, h: H }, { crop });
  const right = c.addPage('spread', A4, s.t.shadow);
  c.image(right, photo, { x: -BLEED, y: -BLEED, w: A4.w + 2 * BLEED, h: H }, { crop: { ...crop, x: crop.x - A4.w } });
}
