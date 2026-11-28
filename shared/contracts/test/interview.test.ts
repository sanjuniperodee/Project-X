import { describe, expect, it } from 'vitest';
import {
  addListItem,
  appendAnswer,
  describeInterview,
  initialScriptState,
  interviewProgress,
  removeListItem,
  scriptAnswer,
  scriptQuestion,
  setAnswer,
  toIsoDate,
  WizardStep,
  type Answers,
} from '../src';

const steps = [
  WizardStep.parse({
    id: 'hero',
    title: 'Герой номера',
    audience: 'owner',
    fields: [
      { id: 'heroName', type: 'text', label: 'Имя героя на обложке', required: true, maxLength: 20 },
      { id: 'eventDate', type: 'date', label: 'Дата праздника' },
      {
        id: 'tone',
        type: 'choice',
        label: 'Стиль номера',
        required: true,
        options: [
          { value: 'vogue', label: 'Глянец' },
          { value: 'noir', label: 'Нуар' },
        ],
      },
      { id: 'story', type: 'textarea', label: 'Самая яркая история' },
    ],
  }),
  WizardStep.parse({
    id: 'timeline',
    title: 'Хронология',
    audience: 'owner',
    fields: [
      {
        id: 'events',
        type: 'list',
        label: 'События',
        itemLabel: 'Событие',
        addLabel: 'Добавить',
        max: 2,
        fields: [
          { id: 'year', type: 'text', label: 'Год', required: true },
          { id: 'title', type: 'text', label: 'Что случилось', required: true },
          { id: 'photo', type: 'photos', label: 'Фото', max: 1 },
        ],
      },
    ],
  }),
  WizardStep.parse({ id: 'photos', title: 'Фотографии', audience: 'owner', fields: [{ id: 'cover', type: 'photos', label: 'Портрет для обложки', required: true, max: 3 }] }),
  WizardStep.parse({ id: 'insight', title: 'Инсайд', audience: 'contributor', fields: [{ id: 'story', type: 'textarea', label: 'История' }] }),
];
const product = { steps };

/** Applies a change the way the page does after saving the step. */
const apply = (answers: Answers, change: { stepId: string; answers: Record<string, unknown> }): Answers => ({ ...answers, [change.stepId]: change.answers });

describe('interview answers', () => {
  it('saves text, dates said in words and options by their label', () => {
    let answers: Answers = {};
    const name = setAnswer(product, answers, 'hero.heroName', '  Айгерим ');
    expect(name).toMatchObject({ ok: true, data: { stepId: 'hero', label: 'Имя героя на обложке', value: 'Айгерим' } });
    if (name.ok) answers = apply(answers, name.data);

    const date = setAnswer(product, answers, 'hero.eventDate', '12 декабря 2026');
    expect(date.ok && date.data.answers.eventDate).toBe('2026-12-12');
    const tone = setAnswer(product, answers, 'tone', 'нуар');
    expect(tone.ok && tone.data.answers).toMatchObject({ heroName: 'Айгерим', tone: 'noir' });
    expect(tone.ok && tone.data.value).toBe('Нуар');
  });

  it('explains what is wrong so the assistant can ask again', () => {
    expect(setAnswer(product, {}, 'hero.heroName', 'Очень-очень длинное имя героя')).toMatchObject({ ok: false, message: expect.stringContaining('не больше 20') });
    expect(setAnswer(product, {}, 'hero.eventDate', 'в декабре')).toMatchObject({ ok: false, message: expect.stringContaining('ГГГГ-ММ-ДД') });
    expect(setAnswer(product, {}, 'hero.tone', 'готика')).toMatchObject({ ok: false, message: expect.stringContaining('vogue (Глянец)') });
    expect(setAnswer(product, {}, 'hero.nope', 'x')).toMatchObject({ ok: false, message: expect.stringContaining('hero.heroName') });
    expect(setAnswer(product, {}, 'photos.cover', 'x')).toMatchObject({ ok: false, message: expect.stringContaining('request_photos') });
    // Contributor steps are not part of the owner's interview.
    expect(setAnswer(product, {}, 'insight.story', 'x').ok).toBe(false);
  });

  it('appends to free text and manages list records', () => {
    let answers: Answers = { hero: { story: 'Дошла до озера.' } };
    const more = appendAnswer(product, answers, 'hero.story', 'И открыла кофейню.');
    expect(more.ok && more.data.answers.story).toBe('Дошла до озера.\nИ открыла кофейню.');

    const first = addListItem(product, answers, 'timeline.events', { year: '2014', title: 'Переехала в Алматы' });
    expect(first.ok && first.data.value).toBe('2014 — Переехала в Алматы');
    if (first.ok) answers = apply(answers, first.data);
    expect(addListItem(product, answers, 'timeline.events', { year: '2021' })).toMatchObject({ ok: false, message: expect.stringContaining('title') });
    expect(addListItem(product, answers, 'timeline.events', { year: '2021', what: 'x' })).toMatchObject({ ok: false, message: expect.stringContaining('year, title') });
    const second = addListItem(product, answers, 'timeline.events', { year: '2021', title: 'Открыла кофейню' });
    if (second.ok) answers = apply(answers, second.data);
    expect(addListItem(product, answers, 'timeline.events', { year: '2024', title: 'Марафон' })).toMatchObject({ ok: false, message: expect.stringContaining('уже 2') });

    const removed = removeListItem(product, answers, 'timeline.events');
    expect(removed.ok && removed.data.answers.events).toEqual([{ year: '2014', title: 'Переехала в Алматы', photo: [] }]);
    expect(removeListItem(product, answers, 'timeline.events', 5).ok).toBe(false);
  });

  it('reports progress and describes the questionnaire for the model', () => {
    const answers: Answers = { hero: { heroName: 'Айгерим' }, timeline: { events: [{ year: '2014', title: 'Переезд' }] } };
    const progress = interviewProgress(product, answers);
    expect(progress).toMatchObject({ answered: 2, total: 6 });
    expect(progress.missing.map((f) => f.path)).toEqual(['hero.tone', 'photos.cover']);

    const brief = describeInterview(product, answers);
    expect(brief).toContain('hero.heroName — «Имя героя на обложке» [обязательно]');
    expect(brief).toContain('Сейчас: Айгерим');
    expect(brief).toContain('vogue = «Глянец»');
    expect(brief).toContain('поля записи: year («Год», обязательно), title («Что случилось», обязательно)');
    expect(brief).toContain('Сейчас 1: 1) 2014 — Переезд');
    expect(brief).toContain('request_photos');
    expect(brief).not.toContain('insight');
  });

  it('reads dates', () => {
    expect(toIsoDate('2026-02-30')).toBeNull();
    expect(toIsoDate('1.3.1996')).toBe('1996-03-01');
    expect(toIsoDate('5 мая 2000 года')).toBe('2000-05-05');
    expect(toIsoDate('7 марта 2001')).toBe('2001-03-07');
  });
});

describe('scripted interviewer', () => {
  it('walks the questionnaire: answers, skips, lists, photos, done', () => {
    let answers: Answers = {};
    let state = initialScriptState();
    const say = (utterance: string) => {
      const turn = scriptQuestion(product, answers, state);
      const reply = scriptAnswer(product, answers, state, turn.expect, utterance);
      for (const change of reply.changes) answers = apply(answers, change);
      state = reply.state;
      return reply;
    };
    const asked = () => scriptQuestion(product, answers, state);

    expect(asked().say).toBe('Имя героя на обложке?');
    expect(say('пропустить').say).toContain('не собрать');
    say('Айгерим');
    expect(asked().say).toBe('Дата праздника?');
    expect(say('не знаю').say).toContain('пропустим');
    expect(asked().say).toContain('Варианты: Глянец, Нуар');
    expect(say('готика').say).toContain('только варианты');
    say('Глянец');
    say('Дошла до озера пешком');

    expect(asked()).toMatchObject({ expect: { kind: 'list' }, say: expect.stringContaining('год, что случилось') });
    expect(say('2014, переехала в Алматы').say).toBe('Записала. Ещё?');
    say('2021 открыла кофейню');
    expect(asked().expect.kind).toBe('list');
    say('готово');
    expect(answers.timeline!.events).toMatchObject([{ year: '2014', title: 'переехала в Алматы' }, { year: '2021', title: 'открыла кофейню' }]);

    expect(asked()).toMatchObject({ expect: { kind: 'photos' }, say: expect.stringContaining('портрет для обложки') });
    say('дальше');
    expect(asked().expect.kind).toBe('done');
    expect(answers.hero).toMatchObject({ heroName: 'Айгерим', tone: 'vogue', story: 'Дошла до озера пешком', eventDate: '' });
  });
});
