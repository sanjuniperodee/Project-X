import { Product, type ProductInput } from '@px/contracts';
import { InMemoryEventBus } from '@px/service-kit/testing';
import { expect, it } from 'vitest';
import { startDraftWorker } from '../src/draft-worker';
import { TemplateDraftGenerator } from '../src/generators/template';
import { describeProject } from '../src/prompts/describe';

const product = Product.parse({
  id: 'boardgame',
  name: 'MyGame',
  domain: 'mygame.kz',
  tagline: 'Игра про вас',
  deposit: 10_000,
  productionDays: 10,
  formats: [{ id: 'quiz', name: 'Викторина', description: 'Q', price: 35_000, specs: ['150 вопросов'] }],
  collaboration: { enabled: true, contributorNoun: 'участники', inviteTitle: 't', inviteDescription: 't' },
  steps: [
    {
      id: 'players',
      title: 'Игроки',
      audience: 'owner',
      fields: [
        {
          id: 'players',
          type: 'list',
          label: 'Игроки',
          itemLabel: 'Игрок',
          addLabel: '+',
          fields: [
            { id: 'name', type: 'text', label: 'Имя' },
            { id: 'photo', type: 'photos', label: 'Фото' },
          ],
        },
        { id: 'tone', type: 'choice', label: 'Градус', options: [{ value: 'roast', label: 'С подколками' }] },
      ],
    },
    { id: 'meme', title: 'Мем', audience: 'contributor', fields: [{ id: 'story', type: 'textarea', label: 'История' }] },
  ],
} satisfies ProductInput);

const submitted = {
  projectId: 'p-1',
  productId: 'boardgame' as const,
  subject: 'Отдел продаж',
  formatId: 'quiz',
  answers: { players: { players: [{ name: 'Ерлан', photo: [{ id: '1', url: '/x.jpg' }] }], tone: 'roast' } },
  contributions: [{ id: 'c1', authorName: 'Мадина', answers: { meme: { story: 'Пицца в 3 ночи' } }, createdAt: new Date().toISOString() }],
};

it('describes answers with the labels customers saw', () => {
  const text = describeProject({ product, project: submitted });
  expect(text).toContain('Игрок 1:');
  expect(text).toContain('Имя: Ерлан');
  expect(text).toContain('Фото: 1 фото');
  expect(text).toContain('Градус: С подколками');
  expect(text).toContain('### Мадина');
});

it('generates a draft for each submitted project and publishes it', async () => {
  const bus = new InMemoryEventBus();
  await startDraftWorker({
    bus,
    generator: new TemplateDraftGenerator(),
    catalog: { product: async () => product },
    log: { info() {}, warn() {}, error() {} },
  });

  await bus.publish('projects.submitted', submitted);
  await bus.drain();

  const generated = bus.published.find((e) => e.type === 'ai.draft_generated');
  expect(generated?.data).toMatchObject({
    projectId: 'p-1',
    generator: 'template',
    draft: { title: 'MyGame: Отдел продаж', cards: [{ title: 'Мадина' }] },
  });
});
