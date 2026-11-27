import { describe, expect, it } from 'vitest';
import type { TextStyle } from '../src/domain/document';
import { fitText, Story, typeset, type FontMetrics } from '../src/domain/text';

/** Every character is 0.5 em wide; "display" has no Kazakh letters and falls back to "body". */
const metrics: FontMetrics = {
  width: (_font, text, size) => [...text].length * size * 0.5,
  covers: (font, cp) => font !== 'display' || !'әғқңөұүһі'.includes(String.fromCodePoint(cp).toLowerCase()),
  fallback: (font) => (font === 'display' ? 'body' : null),
  ascent: (_font, size) => size * 0.8,
  descent: (_font, size) => size * 0.2,
};
const style: TextStyle = { font: 'body', size: 10, leading: 1.5, color: '#000' };

describe('typesetting', () => {
  it('breaks lines greedily at word boundaries', () => {
    const lines = typeset(metrics, 'аа бб вв гг', style, 26); // "аа бб" = 5 chars = 25pt
    expect(lines.map((l) => l.pieces.map((p) => p.text).join(' '))).toEqual(['аа бб', 'вв гг']);
    expect(lines[0]!.height).toBe(15);
  });

  it('justifies all lines but the last, without stretching sparse lines into holes', () => {
    const lines = typeset(metrics, 'ааа ббб ввв гггг дд', { ...style, align: 'justify' }, 60);
    expect(lines[0]!.width).toBe(60);
    expect(lines.at(-1)!.width).toBeLessThan(60);
    const sparse = typeset(metrics, 'а бббббббббб', { ...style, align: 'justify' }, 100);
    expect(sparse[0]!.pieces[1]!.x).toBe(10); // a single huge gap would look broken: left aligned instead
  });

  it('sets missing glyphs in the fallback font', () => {
    const [line] = typeset(metrics, 'Әсел', { ...style, font: 'display' }, 200);
    expect(line!.pieces.map((p) => [p.text, p.font])).toEqual([
      ['Ә', 'body'],
      ['сел', 'display'],
    ]);
  });

  it('flows a story across frames and keeps headings with their text', () => {
    const story = new Story(
      metrics,
      [
        { text: 'один два три четыре пять шесть', style },
        { text: 'Глава', style: { ...style, size: 16 }, keepWithNext: true },
        { text: 'текст после заголовка', style },
      ],
      40,
    );
    const first = story.fill([{ x: 0, y: 0, w: 40, h: 105 }]); // 5 body lines (75) + heading (24) fit, its first line does not
    const placed = first.elements.flatMap((e) => e.lines.map((l) => l.pieces.map((p) => p.text).join(' ')));
    expect(placed).not.toContain('Глава'); // would be stranded at the bottom
    expect(story.done).toBe(false);
    const second = story.fill([{ x: 0, y: 0, w: 40, h: 200 }]);
    expect(second.elements[0]!.lines[0]!.pieces[0]!.text).toBe('Глава');
    expect(story.done).toBe(true);
  });

  it('shrinks a title until its longest word fits instead of breaking the word', () => {
    const element = fitText(metrics, 'Айгерим', { ...style, size: 40 }, { x: 0, y: 0, w: 100, h: 100 }, { minSize: 8, maxLines: 2 });
    expect(element!.lines).toHaveLength(1);
    expect(element!.lines[0]!.style.size).toBeLessThanOrEqual(100 / (7 * 0.5));
  });
});
