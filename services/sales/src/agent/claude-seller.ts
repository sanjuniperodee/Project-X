import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { formatTenge, PROJECT_STATUS_LABELS, ProductId, z } from '@px/contracts';
import type { Logger } from '@px/service-kit';
import type { SellerAgent, SellerTools } from '../application/ports';
import type { ChatMessage, Conversation } from '../domain/conversation';
import { SELLER_SYSTEM_PROMPT } from './prompt';

export interface ClaudeSellerOptions {
  apiKey: string;
  model: string;
  effort: 'low' | 'medium' | 'high';
  log: Logger;
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
const HandOffInput = z.object({ reason: z.string().trim().min(3).max(500) });

/**
 * The AI seller: Claude with tools over the studio's own services (catalog, orders, Kaspi invoices).
 * Runs on the Messages API tool runner inside this service — the chat history lives in our DB, and every tool is a
 * call to a service on the private network.
 */
export class ClaudeSeller implements SellerAgent {
  private readonly client: Anthropic;

  constructor(private readonly options: ClaudeSellerOptions) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 3, timeout: 120_000 });
  }

  async reply({ conversation, history, tools, now }: { conversation: Conversation; history: ChatMessage[]; tools: SellerTools; now: Date }) {
    const messages = toMessages(history);
    if (messages.length === 0 || messages.at(-1)!.role !== 'user') return null;
    messages.push({ role: 'system', content: await this.context(conversation, tools, now) });

    let handedOff = false;
    const runner = this.client.beta.messages.toolRunner({
      model: this.options.model,
      max_tokens: 4096,
      system: SELLER_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
      output_config: { effort: this.options.effort },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      max_iterations: 8,
      tools: this.tools(tools, () => (handedOff = true)),
      messages,
    });
    const final = await runner.runUntilDone();

    if (final.stop_reason === 'refusal') {
      this.options.log.warn({ conversationId: conversation.id, details: final.stop_details }, 'seller refused');
      if (!handedOff) await tools.handOff('ИИ отказался отвечать на сообщение клиента');
      return 'Передал ваш вопрос менеджеру студии — он ответит здесь же.';
    }
    const text = final.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return text || null;
  }

  /** Per-turn facts for the model, sent as an operator (system) message after the customer's turn. */
  private async context(c: Conversation, tools: SellerTools, now: Date) {
    const orders = await tools.orders().catch(() => []);
    const lines = orders.map(({ project: p }) => {
      const due = p.quote.total - p.paidAmount;
      return `- projectId=${p.id}: «${p.subject}», продукт ${p.productId}, статус «${PROJECT_STATUS_LABELS[p.status]}», итого ${formatTenge(p.quote.total)}, оплачено ${formatTenge(p.paidAmount)}${due > 0 ? `, к оплате ${formatTenge(due)}` : ''}`;
    });
    const date = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', dateStyle: 'full', timeStyle: 'short' }).format(now);
    return [
      `Сейчас: ${date} (Алматы).`,
      `Клиент: ${c.name || 'имя не указано'}, WhatsApp ${c.phone ? `+${c.phone}` : 'номер скрыт'}.`,
      lines.length ? `Заказы клиента:\n${lines.join('\n')}` : 'Заказов у клиента пока нет.',
    ].join('\n');
  }

  private tools(t: SellerTools, onHandOff: () => void) {
    const safe = (fn: () => Promise<string>) => async () => {
      try {
        return await fn();
      } catch (error) {
        return `Ошибка: ${(error as Error).message}`;
      }
    };

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
          })(),
      }),
      betaTool({
        name: 'create_order',
        description:
          'Оформить заказ на номер этого WhatsApp, когда клиент выбрал продукт и формат и согласился. Возвращает итог, предоплату и ссылки на кабинет и приглашение друзей. Не вызывай повторно для того же заказа.',
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
            return JSON.stringify({
              projectId: order.project.id,
              total: q.total,
              deposit: q.deposit,
              lines: q.lines,
              workspaceUrl: order.workspaceUrl,
              inviteUrl: order.inviteUrl,
            });
          })(),
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
            return `Счёт на ${formatTenge(r.amount)} отправлен в Kaspi.kz на номер ${r.phone}. Оплату система увидит сама и пришлёт клиенту подтверждение.`;
          })(),
      }),
      betaTool({
        name: 'get_order_links',
        description: 'Ссылки заказа: кабинет (анкета, фото, статус, макет) и приглашение для друзей.',
        inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false },
        run: (input) => safe(async () => JSON.stringify(await t.links(ProjectInput.parse(input).projectId)))(),
      }),
      betaTool({
        name: 'hand_off_to_studio',
        description:
          'Передать чат человеку из студии: клиент просит человека, жалоба, возврат денег, нестандартный заказ (B2B, срочно, свой формат), вопрос вне каталога или ты не уверен. После этого коротко скажи клиенту, что менеджер ответит здесь.',
        inputSchema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'], additionalProperties: false },
        run: (input) =>
          safe(async () => {
            await t.handOff(HandOffInput.parse(input).reason);
            onHandOff();
            return 'Чат передан студии. Бот больше не отвечает в этом чате, пока студия не вернёт его.';
          })(),
      }),
    ];
  }
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
