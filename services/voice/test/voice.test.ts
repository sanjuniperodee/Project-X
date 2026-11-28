import { Product, VOICE_TOOLS, VoiceSessionView, type ProductInput, type ProjectView } from '@px/contracts';
import { AppError } from '@px/service-kit';
import { afterAll, describe, expect, it } from 'vitest';
import { glossy } from '../../catalog/src/products/glossy';
import { AGENT_PLACEHOLDERS, AGENT_PROMPT, AGENT_TOOLS, agentConfig, toolConfig } from '../src/agent/definition';
import { buildVoiceApp } from '../src/app';
import type { VoiceProvider } from '../src/application/ports';

const product = Product.parse(glossy satisfies ProductInput);
const now = '2026-11-28T10:00:00.000Z';

function project(patch: Partial<ProjectView> = {}): ProjectView {
  return {
    id: 'p1',
    productId: 'glossy',
    subject: 'Айгерим',
    status: 'deposit_paid',
    quote: { formatId: 'a4-24', lines: [], total: 25_000, deposit: 10_000, balance: 15_000 } as ProjectView['quote'],
    customer: { name: 'Динара Сейткали', phone: '+77012345678' },
    answers: {},
    contributions: [],
    draft: null,
    layout: null,
    design: { mode: 'auto', revisionsUsed: 0, revisionsLimit: 3 },
    inviteKey: 'invite-key-000000',
    paidAmount: 10_000,
    history: [],
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

const layout: NonNullable<ProjectView['layout']> = {
  version: 2,
  status: 'pending',
  pdfUrl: '/api/media/files/l.pdf',
  pages: [
    { number: 1, kind: 'cover', widthMm: 210, heightMm: 297, previewUrl: '/p1.svg' },
    { number: 2, kind: 'rules', widthMm: 210, heightMm: 297, previewUrl: '/p2.svg' },
  ],
  template: 'glossy-magazine@4',
  warnings: [],
  feedback: null,
  createdAt: now,
  decidedAt: null,
};

const apps: Array<ReturnType<typeof buildVoiceApp>> = [];
afterAll(async () => {
  for (const app of apps) await app.service.app.close();
});

function setup(current: ProjectView, provider?: VoiceProvider) {
  const app = buildVoiceApp({
    projects: {
      project: async (editKey) => {
        if (editKey !== 'edit-key-000000') throw AppError.notFound('Проект');
        return current;
      },
    },
    catalog: { product: async () => product },
    provider,
    logLevel: 'silent',
  });
  apps.push(app);
  const start = (mode: string, editKey = 'edit-key-000000') => app.service.app.inject({ method: 'POST', url: '/voice/sessions', payload: { editKey, mode } });
  return { start };
}

const webrtc: VoiceProvider = { startConversation: async () => ({ conversationToken: 'token-1' }) };

describe('voice sessions', () => {
  it('briefs the agent with the questionnaire and what is already known', async () => {
    const { start } = setup(project({ answers: { hero: { heroName: 'Айгерим', tone: 'noir' } } }), webrtc);
    const res = await start('interview');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const session = VoiceSessionView.parse(res.json());
    if (session.provider !== 'elevenlabs') throw new Error('expected the realtime provider');
    expect(session.conversationToken).toBe('token-1');
    const vars = session.dynamicVariables;
    // Every placeholder of the prompt gets a value.
    expect(Object.keys(vars).sort()).toEqual(Object.keys(AGENT_PLACEHOLDERS).sort());
    for (const key of Object.keys(vars)) expect(`${AGENT_PROMPT} {{first_message}}`).toContain(`{{${key}}}`);
    expect(vars.first_message).toContain('С возвращением, Динара');
    expect(vars.brief).toContain('hero.heroName — «Имя героя на обложке» [обязательно]');
    expect(vars.brief).toContain('Сейчас: Айгерим');
    expect(vars.brief).toContain('noir = «Нуар»');
    expect(vars.brief).toContain('timeline.events');
    expect(vars.brief).toContain('Обязательного не хватает: hero.occasion');
    // Friends' steps are not the owner's interview.
    expect(vars.brief).not.toContain('insight.');
  });

  it('greets a new customer and offers a signed URL when WebRTC is off', async () => {
    const { start } = setup(project(), { startConversation: async () => ({ signedUrl: 'wss://example/signed' }) });
    const session = VoiceSessionView.parse((await start('interview')).json());
    expect(session).toMatchObject({ provider: 'elevenlabs', signedUrl: 'wss://example/signed' });
    if (session.provider === 'elevenlabs') expect(session.dynamicVariables.first_message).toContain('Здравствуйте, Динара! Я редактор Cover Me');
  });

  it('briefs the layout review with pages, texts and the rounds left', async () => {
    const reviewed = project({
      status: 'awaiting_approval',
      layout,
      design: { mode: 'auto', revisionsUsed: 3, revisionsLimit: 3 },
      draft: { title: 'Айгерим: до озера', lead: 'Письмо редактора', sections: [{ heading: 'Интервью', body: 'Текст' }], cards: [{ title: 'Секрет кофейни', text: '' }], generator: 't', generatedAt: now },
    });
    const { start } = setup(reviewed, webrtc);
    const session = VoiceSessionView.parse((await start('edit')).json());
    if (session.provider !== 'elevenlabs') throw new Error('expected the realtime provider');
    expect(session.dynamicVariables.brief).toContain('Макет версии 2');
    expect(session.dynamicVariables.brief).toContain('1 — обложка; 2 — правила жизни');
    expect(session.dynamicVariables.brief).toContain('Заголовок: Айгерим: до озера');
    expect(session.dynamicVariables.brief).toContain('осталось: 0. Следующие правки внесёт дизайнер');
    expect(session.dynamicVariables.first_message).toContain('макет готов');
  });

  it('refuses a mode that does not fit the state of the project', async () => {
    expect((await setup(project({ status: 'in_design' }), webrtc).start('interview')).statusCode).toBe(409);
    expect((await setup(project(), webrtc).start('edit')).statusCode).toBe(409);
    expect((await setup(project({ status: 'awaiting_approval', layout: { ...layout, status: 'approved' } }), webrtc).start('edit')).statusCode).toBe(409);
    expect((await setup(project(), webrtc).start('interview', 'unknown-key-000')).statusCode).toBe(404);
    expect((await setup(project(), webrtc).start('sing')).statusCode).toBe(422);
  });

  it('falls back to the browser without a provider or when the provider is down', async () => {
    expect((await setup(project()).start('interview')).json()).toEqual({ provider: 'browser' });
    const down: VoiceProvider = {
      startConversation: async () => {
        throw AppError.unavailable('ElevenLabs недоступен');
      },
    };
    expect((await setup(project(), down).start('interview')).json()).toEqual({ provider: 'browser' });
  });
});

describe('agent definition', () => {
  it('defines exactly the tools the page implements', () => {
    expect(AGENT_TOOLS.map((t) => t.name).sort()).toEqual(Object.keys(VOICE_TOOLS).sort());
    for (const tool of AGENT_TOOLS) {
      // Required parameters match the page's schema.
      const config = toolConfig(tool);
      const sample = Object.fromEntries(config.parameters.required.map((key) => [key, tool.parameters[key]!.type === 'integer' ? 1 : 'x']));
      expect(VOICE_TOOLS[tool.name].safeParse(sample).success, tool.name).toBe(true);
      expect(config.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    }
  });

  it('builds a private Russian agent that sends transcripts to the page', () => {
    const config = agentConfig({ voiceId: 'voice-1', llm: 'claude-haiku-5-5', toolIds: ['t1'] });
    expect(config.conversation_config.agent).toMatchObject({ language: 'ru', first_message: '{{first_message}}', prompt: { llm: 'claude-haiku-5-5', tool_ids: ['t1'] } });
    expect(config.conversation_config.conversation.client_events).toEqual(expect.arrayContaining(['user_transcript', 'agent_response', 'client_tool_call']));
    expect(config.platform_settings.auth.enable_auth).toBe(true);
  });
});
