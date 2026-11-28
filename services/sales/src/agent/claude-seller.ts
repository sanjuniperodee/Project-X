import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { formatTenge, ProductId, z } from '@px/contracts';
import type { Logger } from '@px/service-kit';
import { HANDOFF_REASONS, type HandoffReason, type SellerAgent, type SellerReply, type SellerTools } from '../application/ports';
import type { ChatMessage, Conversation } from '../domain/conversation';
import { calendar, studioHoursNote } from '../domain/follow-ups';
import { SELLER_SYSTEM_PROMPT } from './prompt';

export interface SellerUsage {
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  conversationId: string | null;
}

export interface ClaudeSellerOptions {
  apiKey: string;
  model: string;
  effort: 'low' | 'medium' | 'high';
  log: Logger;
  /** Every model call (each tool-runner iteration) for the AI spend summary. */
  onUsage?: (usage: SellerUsage) => void;
  client?: Anthropic;
}

type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;

/** Tool inputs are re-validated here: amounts, ids and kinds never reach the services unchecked. */
const CreateOrderInput = z.object({
  productId: ProductId,
  formatId: z.string().min(1),
  extras: z.record(z.string(), z.number().int().min(0).max(20)).default({}),
  subject: z.string().trim().min(2).max(80),
  customerName: z.string().trim().min(2).max(80),
});
const InvoiceInput = z.object({ projectId: z.string().min(1), kind: z.enum(['deposit', 'balance']) });
const ProjectInput = z.object({ projectId: z.string().min(1) });
const CardInput = z.object({ productId: ProductId, formatId: z.string().min(1), caption: z.string().max(300).default('') });
const LinkInput = z.object({ text: z.string().max(300).default('') });
const HANDOFF_CODES = Object.keys(HANDOFF_REASONS) as [HandoffReason, ...HandoffReason[]];
const HandOffInput = z.object({ reason: z.enum(HANDOFF_CODES), summary: z.string().trim().min(3).max(600) });

/**
 * The AI seller: Claude with tools over the studio's own services (catalog, orders, Kaspi invoices, WhatsApp catalog
 * cards). Runs on the Messages API tool runner inside this service — the chat history lives in our DB, and every tool
 * is a call to a service on the private network. The finished text is checked by code (amounts, details, links):
 * one rewrite, then the chat goes to the studio (the MyBooks rule).
 */
export class ClaudeSeller implements SellerAgent {
  private readonly client: Anthropic;

  constructor(private readonly options: ClaudeSellerOptions) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 3, timeout: 120_000 });
  }

  async reply(input: Parameters<SellerAgent['reply']>[0]): Promise<SellerReply> {
    const { conversation, history, tools, now, mode, check } = input;
    const base = toMessages(history);
    if (mode === 'follow_up') {
      base.push({ role: 'user', content: `[служебно, клиент этого не писал] ${followUpNote(history, now)}` });
    }
    if (base.length === 0 || base.at(-1)!.role !== 'user') return { text: null, handedOff: false };
    const context = await this.context(conversation, tools, now);

    const state = { handedOff: false, amounts: [] as number[] };
    let correction = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const messages: BetaMessageParam[] = [...base, { role: 'system', content: correction ? `${context}\n\n${correction}` : context }];
      const runner = this.client.beta.messages.toolRunner({
          model: this.options.model,
          max_tokens: 4096,
          system: SELLER_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
          output_config: { effort: this.options.effort },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          max_iterations: 8,
          tools: this.tools(tools, state),
          messages,
        });
      // Iterate instead of runUntilDone: every iteration is a billed call, and each one goes to the spend summary.
      let final: Anthropic.Beta.Messages.BetaMessage | undefined;
      for await (const message of runner) {
        final = message;
        this.options.onUsage?.({
          purpose: input.purpose ?? mode,
          model: message.model,
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
          conversationId: input.purpose === 'trial' ? null : conversation.id,
        });
      }
      if (!final) return { text: null, handedOff: state.handedOff };

      if (final.stop_reason === 'refusal') {
        this.options.log.warn({ conversationId: conversation.id, details: final.stop_details }, 'seller refused');
        if (!state.handedOff) await tools.handOff('unsure', 'ИИ отказался отвечать на сообщение клиента');
        return { text: 'Передал ваш вопрос менеджеру студии — он ответит здесь же.', handedOff: true };
      }
      const text = final.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (!text || state.handedOff) return { text: text || null, handedOff: state.handedOff };

      const problems = check(text, state.amounts);
      if (!problems.length) return { text, handedOff: false };
      this.options.log.warn({ conversationId: conversation.id, problems, attempt }, 'seller reply blocked');
      correction = `## Исправление\nТвой предыдущий ответ не прошёл проверку: ${problems.join('; ')}. Напиши ответ заново без этого. Уже сделанное инструментами повторять не нужно — заказ и счёт не дублируются.`;
    }
    await tools.handOff('ai_blocked', 'Ответ бота дважды не прошёл проверку (суммы, реквизиты или ссылки)');
    return { text: 'Уточню у менеджера студии и вернусь с ответом здесь же 🙏', handedOff: true };
  }

  /** Per-turn facts for the model, sent as an operator (system) message after the customer's turn. */
  private async context(c: Conversation, tools: SellerTools, now: Date) {
    const [briefs, cards] = await Promise.all([tools.orderBriefs().catch(() => []), tools.catalogCards().catch(() => [])]);
    const date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', dateStyle: 'full', timeStyle: 'short' }).format(now);
    return [
      '## Сейчас',
      `Дата и время: ${date} (Алматы). ${studioHoursNote(now)}`,
      `Календарь (день недели к числу бери отсюда, не считай сам): ${calendar(now)}.`,
      `Клиент: ${c.name || 'имя не указано'}; номер WhatsApp ${c.phone ? 'известен — счёт Kaspi уйдёт на него' : 'скрыт — для заказа попроси номер телефона'}.`,
      briefs.length ? `## Заказы клиента (актуально на эту минуту — клиент может заполнять анкету прямо сейчас)\n${briefs.join('\n\n')}` : 'Заказов у клиента пока нет.',
      cards.length
        ? `Карточки в каталоге WhatsApp (send_product_card): ${cards.map((k) => `${k.productId}/${k.formatId} «${k.name}»`).join('; ')}.`
        : 'Каталога WhatsApp пока нет — описывай форматы словами.',
    ].join('\n');
  }

  private tools(t: SellerTools, state: { handedOff: boolean; amounts: number[] }) {
    const safe = (fn: () => Promise<string>) =>
      fn().catch((error: Error) => `Ошибка: ${error.message}`);

    return [
      betaTool({
        name: 'get_products',
        description:
          'Каталог студии: продукты, форматы с ценами, допы, предоплата, срок производства. Вызывай перед тем, как называть цену или формат — цены знаешь только отсюда.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        run: () =>
          safe(async () => {
            const products = await t.products();
            return JSON.stringify(
              products.map((p) => ({
                productId: p.id,
                name: p.name,
                tagline: p.tagline,
                deposit: p.deposit,
                productionDays: p.productionDays,
                formats: p.formats.map((f) => ({ formatId: f.id, name: f.name, description: f.description, price: f.price })),
                extras: p.extras.map((e) => ({ extraId: e.id, name: e.name, description: e.description, unitPrice: e.unitPrice, maxQuantity: e.maxQuantity })),
                friendsCanContribute: p.collaboration.enabled,
              })),
            );
          }),
      }),
      betaTool({
        name: 'send_product_card',
        description:
          'Прислать клиенту карточку формата из каталога WhatsApp (фото, цена, кнопка «в корзину») — когда показываешь конкретный формат. Только форматы из списка карточек в контексте. caption — короткая подпись под карточкой.',
        inputSchema: {
          type: 'object',
          properties: { productId: { type: 'string', enum: ['glossy', 'shezhire', 'boardgame'] }, formatId: { type: 'string' }, caption: { type: 'string' } },
          required: ['productId', 'formatId', 'caption'],
          additionalProperties: false,
        },
        run: (input) =>
          safe(async () => {
            const { productId, formatId, caption } = CardInput.parse(input);
            return t.sendProductCard(productId, formatId, caption);
          }),
      }),
      betaTool({
        name: 'send_catalog_link',
        description: 'Прислать ссылку на весь каталог студии в WhatsApp с превью — когда клиент хочет посмотреть все варианты.',
        inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'Короткая подводка к ссылке' } }, required: ['text'], additionalProperties: false },
        run: (input) => safe(async () => t.sendCatalogLink(LinkInput.parse(input).text)),
      }),
      betaTool({
        name: 'create_order',
        description:
          'Оформить заказ на номер этого WhatsApp, когда клиент выбрал продукт и формат и согласился. Возвращает итог, предоплату и ссылки на кабинет и приглашение друзей. Повторный вызов для того же формата вернёт тот же заказ.',
        inputSchema: {
          type: 'object',
          properties: {
            productId: { type: 'string', enum: ['glossy', 'shezhire', 'boardgame'] },
            formatId: { type: 'string', description: 'formatId из get_products' },
            extras: { type: 'object', additionalProperties: { type: 'integer' }, description: 'extraId → количество; {} если допов нет' },
            subject: { type: 'string', description: 'О ком подарок: «Айгерим», «Семья Сейткалиевых», «Отдел маркетинга»' },
            customerName: { type: 'string', description: 'Имя заказчика' },
          },
          required: ['productId', 'formatId', 'extras', 'subject', 'customerName'],
          additionalProperties: false,
        },
        run: (input) =>
          safe(async () => {
            const order = await t.createOrder(CreateOrderInput.parse(input));
            const q = order.project.quote;
            state.amounts.push(q.total, q.deposit, q.balance, ...q.lines.map((l) => l.total));
            return JSON.stringify({ projectId: order.project.id, reused: order.reused, total: q.total, deposit: q.deposit, lines: q.lines, workspaceUrl: order.workspaceUrl, inviteUrl: order.inviteUrl });
          }),
      }),
      betaTool({
        name: 'send_payment_invoice',
        description:
          'Выставить счёт Kaspi на номер заказа: kind=deposit — предоплата после оформления, kind=balance — остаток после согласования макета. Сумму считает система. Счёт придёт клиенту в приложение Kaspi.kz.',
        inputSchema: {
          type: 'object',
          properties: { projectId: { type: 'string' }, kind: { type: 'string', enum: ['deposit', 'balance'] } },
          required: ['projectId', 'kind'],
          additionalProperties: false,
        },
        run: (input) =>
          safe(async () => {
            const { projectId, kind } = InvoiceInput.parse(input);
            const r = await t.sendInvoice(projectId, kind);
            state.amounts.push(r.amount);
            return r.alreadySent
              ? `Счёт на ${formatTenge(r.amount)} уже отправлен в Kaspi.kz несколько минут назад — новый не выставлен. Попроси клиента проверить уведомления Kaspi.`
              : `Счёт на ${formatTenge(r.amount)} отправлен в Kaspi.kz на номер ${r.phone}. Оплату система увидит сама и пришлёт клиенту подтверждение.`;
          }),
      }),
      betaTool({
        name: 'get_order_links',
        description: 'Ссылки заказа: кабинет (анкета, фото, статус, макет) и приглашение для друзей.',
        inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false },
        run: (input) => safe(async () => JSON.stringify(await t.links(ProjectInput.parse(input).projectId))),
      }),
      betaTool({
        name: 'hand_off_to_studio',
        description:
          'Передать чат человеку из студии. reason: human_request (просит человека), call_request (просит позвонить), paid_claim (говорит, что оплатил, или прислал чек), payment_issue, complaint, custom_request (B2B, срочно, свой формат), objection (третье подряд возражение), unsure (нет ответа в каталоге или сомневаешься). summary — для менеджера: кому подарок, что обсудили, что обещано. После этого коротко скажи клиенту, когда ответит менеджер (время — из контекста).',
        inputSchema: {
          type: 'object',
          properties: { reason: { type: 'string', enum: HANDOFF_CODES }, summary: { type: 'string' } },
          required: ['reason', 'summary'],
          additionalProperties: false,
        },
        run: (input) =>
          safe(async () => {
            const { reason, summary } = HandOffInput.parse(input);
            await t.handOff(reason, summary);
            state.handedOff = true;
            return 'Чат передан студии. Бот больше не отвечает в этом чате, пока студия не вернёт его.';
          }),
      }),
    ];
  }
}

function followUpNote(history: ChatMessage[], now: Date) {
  const last = history.filter((m) => m.author === 'customer').at(-1);
  const silent = last ? Math.round((now.getTime() - last.createdAt.getTime()) / 60_000) : null;
  return (
    `Клиент не отвечает${silent ? ` около ${silent >= 120 ? `${Math.round(silent / 60)} ч` : `${silent} мин`}` : ''} после нашего сообщения. ` +
    'Если уместно — напиши одно короткое тёплое напоминание по сути разговора (без давления, без «вы ещё с нами?», без выдуманных скидок и сроков). ' +
    'Если писать не стоит (клиент сказал, что подумает до определённого дня, или уже попрощался) — ответь пустым сообщением.'
  );
}

/** Chat history → Messages API turns: customer = user, our side = assistant, consecutive turns merged. */
export function toMessages(history: ChatMessage[]): BetaMessageParam[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of history) {
    const role = m.author === 'customer' ? 'user' : 'assistant';
    const text = m.author === 'studio' ? `[менеджер студии] ${m.text}` : m.author === 'system' ? `[уведомление] ${m.text}` : m.text;
    const last = out.at(-1);
    if (last?.role === role) last.content += `\n${text}`;
    else out.push({ role, content: text });
  }
  while (out[0]?.role === 'assistant') out.shift();
  return out;
}
