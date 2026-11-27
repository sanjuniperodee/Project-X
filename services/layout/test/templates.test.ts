import type { LayoutSource } from '@px/contracts';
import { describe, expect, it } from 'vitest';
import { BLEED } from '../src/domain/document';
import { FontLibrary } from '../src/infrastructure/fonts';
import { TEMPLATES, type PhotoLibrary } from '../src/templates';
import * as f from './fixtures/materials';

const fonts = new FontLibrary();
/** Every photo is a 3:4 portrait except keys containing "land". */
const photos: PhotoLibrary = { get: (ref) => ({ key: `${ref.id}.jpg`, width: ref.id.includes('land') ? 1600 : 900, height: 1200 }) };

function build(source: LayoutSource, draft: typeof f.glossyDraft) {
  return TEMPLATES[source.productId].build({ product: f.products[source.productId], source, draft, photos }, fonts);
}

function elements(doc: ReturnType<typeof build>, type: string) {
  return doc.pages.flatMap((p) => p.elements.filter((e) => e.type === type));
}

function texts(doc: ReturnType<typeof build>, kind?: string) {
  return doc.pages
    .filter((p) => !kind || p.kind === kind)
    .flatMap((p) => p.elements.flatMap((e) => (e.type === 'text' ? e.lines.map((l) => l.pieces.map((x) => x.text).join(' ')) : [])));
}

describe('Cover Me', () => {
  it('fills exactly the pages of the chosen format', () => {
    expect(build(f.glossySource(), f.glossyDraft).pages).toHaveLength(24);
    const big = { ...f.glossySource(), formatId: 'a4-36' };
    const doc = build(big, f.glossyDraft);
    expect(doc.pages).toHaveLength(36);
    expect(doc.pages[0]!.kind).toBe('cover');
    expect(doc.pages.at(-1)!.kind).toBe('back');
  });

  it('puts the hero on the cover and every friend in the friends section', () => {
    const doc = build(f.glossySource(), f.glossyDraft);
    expect(texts(doc, 'cover')).toContain('Айгерим');
    const friends = texts(doc, 'friends');
    expect(friends).toContain('Әсел Нұрланқызы');
    expect(friends).toContain('Ерлан');
    // The draft's own friends section is not printed twice.
    expect(doc.pages.filter((p) => p.kind === 'article').length).toBeGreaterThan(0);
    expect(texts(doc, 'article')).not.toContain('Инсайды от друзей');
  });

  it('places every photo inside the page or its bleed, each photo once', () => {
    const doc = build(f.glossySource(), f.glossyDraft);
    const images = elements(doc, 'image') as Array<{ photo: { key: string }; box: { x: number; y: number; w: number; h: number } }>;
    for (const page of doc.pages) {
      for (const e of page.elements) {
        if (e.type !== 'image') continue;
        expect(e.box.x).toBeGreaterThanOrEqual(-BLEED - 0.01);
        expect(e.box.y).toBeGreaterThanOrEqual(-BLEED - 0.01);
        expect(e.box.x + e.box.w).toBeLessThanOrEqual(page.size.w + BLEED + 0.01);
        expect(e.box.y + e.box.h).toBeLessThanOrEqual(page.size.h + BLEED + 0.01);
      }
    }
    // The editor's letter repeats the cover portrait in a circle; nothing else repeats.
    const keys = doc.pages
      .filter((p) => p.kind !== 'letter')
      .flatMap((p) => p.elements)
      .filter((e) => e.type === 'image')
      .map((e) => (e as { photo: { key: string } }).photo.key);
    expect(images.length).toBeGreaterThan(keys.length - 1);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('sets long texts smaller and warns the studio when even that does not fit', () => {
    const long = { ...f.glossyDraft, sections: [{ heading: 'Большое интервью', body: Array(150).fill(f.glossyDraft.sections[0]!.body).join('\n\n') }] };
    const doc = build(f.glossySource(), long);
    expect(doc.pages.length % 4).toBe(0);
    expect(doc.warnings.join(' ')).toMatch(/Материалов больше/);
  });

  it('sets a rubric for every kind of material in reading order', () => {
    const doc = build(f.glossySource(), f.glossyDraft);
    const kinds = doc.pages.map((p) => p.kind);
    const order = ['cover', 'contents', 'letter', 'dossier', 'article', 'tastes', 'timeline', 'numbers', 'then-now', 'rules', 'friends', 'words', 'photos', 'back'];
    const firstIndex = order.map((kind) => kinds.indexOf(kind));
    expect(firstIndex.every((i) => i >= 0)).toBe(true);
    expect([...firstIndex].sort((a, b) => a - b)).toEqual(firstIndex);
    expect(texts(doc, 'dossier').join(' ')).toContain('Стрелец'); // born on 12 December
    expect(texts(doc, 'numbers').join(' ')).toContain('3200');
    expect(texts(doc, 'words').join(' ')).toContain('Ураган');
  });

  it('keeps prose from the AI as prose: a colon inside a sentence is not a question', () => {
    const draft = { ...f.glossyDraft, sections: [{ heading: 'Большое интервью', body: 'Первый абзац.\n\nОна дошла: на день позже, но дошла.' }] };
    const question = texts(build(f.glossySource(), draft), 'article').find((t) => t.startsWith('Она дошла'));
    expect(question).toBeDefined();
    const styled = build(f.glossySource(), draft)
      .pages.flatMap((p) => p.elements)
      .flatMap((e) => (e.type === 'text' ? e.lines : []))
      .find((l) => l.pieces[0]?.text === 'Она');
    expect(styled?.style.font).toBe('inter-400');
  });

  it('builds the full format from a minimal questionnaire and tells the studio materials are short', () => {
    const minimal: LayoutSource = {
      ...f.glossySource(),
      answers: {
        hero: { heroName: 'Дана', occasion: 'birthday', tone: 'tender' },
        interview: { threeWords: 'Добрая, тихая, смелая', bestStory: 'Однажды она испекла торт на сто человек.' },
        photos: { cover: [{ id: 'only', url: '/api/media/files/only.jpg' }] },
      },
      contributions: [],
    };
    const doc = build(minimal, { ...f.glossyDraft, generator: 'template', cards: [], sections: [] });
    expect(doc.pages).toHaveLength(24);
    expect(doc.pages[0]!.kind).toBe('cover');
    expect(doc.pages.at(-1)!.kind).toBe('back');
    expect(doc.warnings.join(' ')).toMatch(/Материалов мало/);
  });

  it('gives every friend a page of their own when a 36-page issue has room', () => {
    const doc = build({ ...f.glossySource(), formatId: 'a4-36' }, f.glossyDraft);
    expect(doc.pages).toHaveLength(36);
    const friendPages = doc.pages.filter((p) => p.kind === 'friends');
    expect(friendPages).toHaveLength(f.glossySource().contributions.length);
  });
});

describe('Шежіре', () => {
  it('builds the book with the tree, generations from oldest to youngest and the archive', () => {
    const doc = build(f.shezhireSource(), f.shezhireDraft);
    expect(doc.pages).toHaveLength(48);
    const kinds = doc.pages.map((p) => p.kind);
    expect(kinds.indexOf('tree')).toBeLessThan(kinds.indexOf('generation'));
    expect(kinds).toContain('archive');
    const generations = texts(doc, 'generation');
    expect(generations.indexOf('Прабабушки и прадеды')).toBeLessThan(generations.indexOf('Дети и внуки'));
    // A relative without a bio gets the editor's short bio from the draft cards.
    expect(generations.join(' ')).toContain('мотоцикл');
    expect(texts(doc, 'tree')).toContain('Ғалия');
  });
});

describe('MyGame', () => {
  it('imposes cards 9 per sheet, each sheet followed by its backs, and adds the board and money', () => {
    const doc = build(f.boardgameSource('city-tycoon'), f.boardgameDraft);
    const kinds = doc.pages.map((p) => p.kind);
    expect(kinds[0]).toBe('box');
    const sheets = kinds.filter((k) => k === 'cards').length;
    expect(kinds.filter((k) => k === 'card-backs')).toHaveLength(sheets);
    kinds.forEach((k, i) => k === 'cards' && expect(kinds[i + 1]).toBe('card-backs'));
    // 5 players + 14 draft cards + 7 places = 26 cards = 3 sheets
    expect(sheets).toBe(3);
    const board = doc.pages.find((p) => p.kind === 'board')!;
    expect(board.size.w).toBeCloseTo((500 * 72) / 25.4);
    expect(kinds).toContain('money');
  });

  it('prints no board for the card game and uses default rules with the template generator', () => {
    const doc = build(f.boardgameSource('conflict-cards'), { ...f.boardgameDraft, generator: 'template', sections: [] });
    expect(doc.pages.map((p) => p.kind)).not.toContain('board');
    expect(texts(doc, 'rules').join(' ')).toContain('Подготовка');
  });
});
