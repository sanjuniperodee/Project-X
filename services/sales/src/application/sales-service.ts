import { randomUUID } from 'node:crypto';
import {
  formatTenge,
  type ConversationSummary,
  type ConversationView,
  type EventEnvelope,
  type PaymentKind,
  type ProductId,
  ProjectStatus,
  type WhatsAppStatus,
} from '@px/contracts';
import { AppError, type Logger } from '@px/service-kit';
import { catalogLink } from '../domain/catalog';
import {
  BOT_LIMITS,
  botMayAnswer,
  chatIdFromJid,
  handOff,
  normalizePhone,
  pauseForHuman,
  phoneFromChatId,
  type Author,
  type ChatMessage,
  type Conversation,
} from '../domain/conversation';
import { followUpDue } from '../domain/follow-ups';
import { stripForeignLinks, type Links } from '../domain/links';
import { statusMessage } from '../domain/notifications';
import { orderBrief } from '../domain/order-brief';
import { allowedAmounts, asksSomething, checkReply, splitReply } from '../domain/reply-check';
import type { CatalogService } from './catalog-service';
import {
  HANDOFF_REASONS,
  type CatalogGateway,
  type CatalogGatewayWa,
  type ConversationRepository,
  type HandoffReason,
  type InboundMessage,
  type ProjectsGateway,
  type SellerAgent,
  type SellerTools,
  type WhatsAppGateway,
} from './ports';

export interface SalesDeps {
  repository: ConversationRepository;
  whatsapp: WhatsAppGateway;
  catalog: CatalogGateway;
  projects: ProjectsGateway;
  /** null: no AI key — chats are handed to the studio. */
  agent: SellerAgent | null;
  /** WhatsApp Business catalog (cards); null when the gateway has no catalog support. */
  waCatalog: { service: CatalogService; wa: CatalogGatewayWa } | null;
  links: Links;
  /** Studio owner's WhatsApp (digits): hand-offs and alerts. */
  studioPhone: string | null;
  log: Logger;
}

/** Events older than this are history (a new durable consumer replays the stream): no customer message. */
const STALE_EVENT_MS = 60 * 60_000;
/** How long to wait before deciding an outgoing message was typed on the studio phone, not sent by us. */
export let ECHO_GRACE_MS = 3000;
export const setEchoGrace = (ms: number) => (ECHO_GRACE_MS = ms);
/** Pause between the parts of a multi-message reply (reads like a person typing). */
export let PART_DELAY_MS = 1500;
export const setPartDelay = (ms: number) => (PART_DELAY_MS = ms);
/** The same invoice is not pushed to the customer's Kaspi twice within this window. */
const INVOICE_REPEAT_MS = 15 * 60_000;
/** A second order for the same product and format within this window reuses the first one. */
const ORDER_REUSE_MS = 3 * 3600_000;

export class SalesService {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly running = new Set<string>();
  private readonly invoicesSent = new Map<string, number>();

  constructor(private readonly deps: SalesDeps) {}

  // ---------- Inbound ----------

  async handleInbound(message: InboundMessage): Promise<void> {
    const { repository } = this.deps;
    const chatId = chatIdFromJid(message.chatId);
    if (message.fromMe) {
      // Our own sends echo back; anything else typed on the studio phone means a person is answering.
      // The echo can arrive before the send call returns its id: give our own send a moment to be stored.
      await new Promise((r) => setTimeout(r, ECHO_GRACE_MS));
      if (await repository.isOurMessage(message.externalId)) return;
      const c = await this.conversation(chatId, '');
      if (await repository.recentOurText(c.id, message.text, new Date(Date.now() - 2 * 60_000))) return;
      if (!(await this.store(c, 'studio', message.text, message.externalId, message.at))) return;
      pauseForHuman(c, message.at);
      c.pending = false;
      await repository.update(c);
      return;
    }

    const c = await this.conversation(chatId, message.contactName);
    if (!(await this.store(c, 'customer', message.text, message.externalId, message.at))) return;
    c.pending = true;
    c.followUps = 0;
    c.lastCustomerAt = message.at;
    if (message.contactName && !c.name) c.name = message.contactName;
    await repository.update(c);
    this.schedule(c.id);
  }

  /** Several quick messages from a customer get one answer. */
  private schedule(conversationId: string, delay: number = BOT_LIMITS.debounceMs) {
    clearTimeout(this.timers.get(conversationId));
    const timer = setTimeout(() => {
      this.timers.delete(conversationId);
      void this.answer(conversationId).catch((error: Error) => this.deps.log.error({ err: error, conversationId }, 'bot reply failed'));
    }, delay);
    timer.unref();
    this.timers.set(conversationId, timer);
  }

  /** After a restart: answer chats that were waiting. */
  async resumePending() {
    for (const c of await this.deps.repository.pending()) this.schedule(c.id, 1000);
  }

  async answer(conversationId: string, now = new Date()): Promise<void> {
    if (this.running.has(conversationId)) return this.schedule(conversationId);
    this.running.add(conversationId);
    try {
      const { repository, agent } = this.deps;
      const c = await repository.get(conversationId);
      if (!c?.pending) return;
      c.pending = false;
      if (!botMayAnswer(c, now)) {
        if (c.botTurns >= BOT_LIMITS.maxTurns && c.mode === 'bot') await this.handOff(c, 'unsure', 'Длинный диалог: бот достиг лимита ответов');
        await repository.update(c);
        return;
      }
      if (c.mode === 'human') {
        c.mode = 'bot';
        c.botPausedUntil = null;
      }
      if (!agent) {
        await this.handOff(c, 'unsure', 'ИИ-продажник не настроен (нет ключа)');
        await repository.update(c);
        return;
      }
      await repository.update(c);
      const history = await repository.history(c.id, BOT_LIMITS.historyMessages);
      const lastSeen = history.at(-1)?.id;
      const result = await agent.reply({ conversation: c, history, tools: this.toolsFor(c), now, mode: 'reply', check: await this.checker(c) });

      // While the model was thinking: the studio may have answered, or the customer may have written more.
      const fresh = (await repository.get(c.id)) ?? c;
      // The studio took the chat meanwhile (the bot's own hand-off still gets its "a manager will answer" line).
      if (fresh.mode !== 'bot' && !result.handedOff) return;
      const latest = await repository.history(c.id, 1);
      if (latest.at(-1)?.id !== lastSeen && latest.at(-1)?.author === 'customer') {
        fresh.pending = true;
        await repository.update(fresh);
        return this.schedule(c.id, 500);
      }

      if (result.text?.trim()) {
        await this.sendParts(fresh, result.text);
        fresh.botTurns += 1;
      } else if (!result.handedOff && asksSomething(lastCustomerText(history))) {
        // Silence is fine after "ok, thanks", not after a question.
        await this.handOff(fresh, 'unsure', 'Бот промолчал на вопрос клиента');
      }
      await repository.update(fresh);
    } finally {
      this.running.delete(conversationId);
    }
  }

  /** Paragraphs go as separate messages; a studio reply in the middle stops the rest. */
  private async sendParts(c: Conversation, text: string) {
    const parts = splitReply(toWhatsApp(stripForeignLinks(text.trim(), this.deps.links.allowedOrigins())));
    for (const [i, part] of parts.entries()) {
      if (i > 0) {
        await new Promise((r) => setTimeout(r, PART_DELAY_MS));
        const now = await this.deps.repository.get(c.id);
        if (now?.mode !== 'bot' && !now?.handoffReason) return;
      }
      await this.send(c, 'bot', part);
    }
  }

  /** Problems in a finished bot text: money not from the catalog or this turn's tools, card numbers, other phones, links. */
  private async checker(c: Conversation) {
    const products = await this.deps.catalog.products();
    const amounts = allowedAmounts(products);
    const orders = await this.deps.repository.projects(c.id);
    for (const link of orders) {
      const p = await this.deps.projects.get(link.editKey).catch(() => null);
      if (p) [p.quote.total, p.quote.deposit, p.quote.balance, p.quote.total - p.paidAmount, p.paidAmount].forEach((a) => amounts.add(a));
    }
    const status = this.deps.whatsapp.enabled ? await this.deps.whatsapp.status().catch(() => null) : null;
    const origins = [...this.deps.links.allowedOrigins(), ...(status?.phone ? ['https://wa.me'] : [])];
    const phones = [c.phone, status?.phone, this.deps.studioPhone].filter(Boolean) as string[];
    return (text: string, extra: number[]) => checkReply(text, { amounts: new Set([...amounts, ...extra]), allowedOrigins: origins, allowedPhones: phones });
  }

  // ---------- Follow-ups ----------

  /** Reminders to customers who went silent after our message (run every minute). */
  async followUps(now = new Date()) {
    const { repository, agent, projects } = this.deps;
    if (!agent) return;
    for (const c of await repository.followUpCandidates(new Date(now.getTime() - 15 * 60_000))) {
      if (this.running.has(c.id) || !botMayAnswer(c, now) || c.mode !== 'bot') continue;
      const history = await repository.history(c.id, BOT_LIMITS.historyMessages);
      const last = history.at(-1);
      if (!last || last.author !== 'bot') continue;
      const links = await repository.projects(c.id);
      const orders = await Promise.all(links.map((l) => projects.get(l.editKey).catch(() => null)));
      // An order already moving (deposit paid or later) is followed by status notifications, not sales reminders.
      if (orders.some((p) => p && p.status !== 'draft')) continue;
      const warm = links.length > 0 || history.some((m) => m.author === 'bot' && /₸/.test(m.text));
      if (!followUpDue({ followUps: c.followUps, lastOurMessageAt: last.createdAt, warm, now })) continue;

      this.running.add(c.id);
      try {
        c.followUps += 1;
        await repository.update(c);
        const result = await agent.reply({ conversation: c, history, tools: this.toolsFor(c), now, mode: 'follow_up', check: await this.checker(c) });
        const fresh = (await repository.get(c.id)) ?? c;
        if (fresh.mode === 'bot' && !fresh.pending && result.text?.trim()) await this.sendParts(fresh, result.text);
        await repository.update(fresh);
      } catch (error) {
        this.deps.log.warn({ err: error, conversationId: c.id }, 'follow-up failed');
      } finally {
        this.running.delete(c.id);
      }
    }
  }

  // ---------- Bot tools (amounts and links come from the services, not the model) ----------

  private toolsFor(c: Conversation): SellerTools {
    const { catalog, projects, repository, links, waCatalog, whatsapp } = this.deps;
    const own = async (projectId: string) => {
      const link = await repository.projectLink(projectId);
      if (!link || link.conversationId !== c.id) throw AppError.notFound('Заказ этого клиента');
      return link;
    };
    return {
      products: () => catalog.products(),
      orders: async () => {
        const linked = await repository.projects(c.id);
        return Promise.all(linked.map(async (link) => ({ project: await projects.get(link.editKey), link })));
      },
      orderBriefs: async () => {
        const linked = await repository.projects(c.id);
        return Promise.all(
          linked.map(async (link) => {
            const [p, product] = await Promise.all([projects.get(link.editKey), catalog.product(link.productId)]);
            return orderBrief(p, product, { workspaceUrl: links.workspace(link.productId, link.editKey), inviteUrl: links.invite(link.productId, link.inviteKey) });
          }),
        );
      },
      createOrder: async (input) => {
        const phone = c.phone ?? phoneFromChatId(c.chatId);
        if (!phone) throw AppError.badRequest('Номер скрыт: попросите клиента написать номер телефона для заказа');
        // The same order twice (a repeated tool call, "давайте оформим" twice): reuse the fresh unpaid one.
        for (const link of await repository.projects(c.id)) {
          if (link.productId !== input.productId) continue;
          const p = await projects.get(link.editKey);
          if (p.status === 'draft' && p.quote.formatId === input.formatId && Date.now() - new Date(p.createdAt).getTime() < ORDER_REUSE_MS) {
            return { project: p, workspaceUrl: links.workspace(link.productId, link.editKey), inviteUrl: links.invite(link.productId, link.inviteKey), reused: true };
          }
        }
        const created = await projects.create({
          productId: input.productId,
          subject: input.subject,
          selection: { formatId: input.formatId, extras: input.extras },
          customer: { name: input.customerName, phone: `+${phone}` },
        });
        const link = { projectId: created.id, conversationId: c.id, productId: input.productId, editKey: created.editKey, inviteKey: created.inviteKey };
        await repository.linkProject(link);
        if (!c.name) {
          c.name = input.customerName;
          await repository.update(c);
        }
        return {
          project: await projects.get(created.editKey),
          workspaceUrl: links.workspace(input.productId, created.editKey),
          inviteUrl: links.invite(input.productId, created.inviteKey),
          reused: false,
        };
      },
      sendInvoice: async (projectId: string, kind: PaymentKind) => {
        const link = await own(projectId);
        const project = await projects.get(link.editKey);
        const due = kind === 'deposit' ? project.quote.deposit : project.quote.total - project.paidAmount;
        const key = `${projectId}:${kind}`;
        if (Date.now() - (this.invoicesSent.get(key) ?? 0) < INVOICE_REPEAT_MS) {
          return { amount: due, phone: project.customer.phone, alreadySent: true };
        }
        await projects.checkout(link.editKey, kind);
        this.invoicesSent.set(key, Date.now());
        return { amount: due, phone: project.customer.phone, alreadySent: false };
      },
      links: async (projectId: string) => {
        const link = await own(projectId);
        return { workspaceUrl: links.workspace(link.productId, link.editKey), inviteUrl: links.invite(link.productId, link.inviteKey) };
      },
      catalogCards: async () => {
        if (!waCatalog) return [];
        const cards = await waCatalog.service.approvedCards();
        return cards.flatMap((p) => {
          const m = /^px:([a-z]+):(.+)$/.exec(p.retailerId);
          return m ? [{ productId: m[1]!, formatId: m[2]!, name: p.name, price: p.price }] : [];
        });
      },
      sendProductCard: async (productId: string, formatId: string, caption: string) => {
        if (!waCatalog) throw AppError.conflict('Каталог WhatsApp не подключён');
        const card = await waCatalog.service.cardFor(productId, formatId);
        if (!card) throw AppError.conflict('Этого формата нет в каталоге WhatsApp (или он на проверке) — опиши словами');
        const body = caption.trim().slice(0, 300);
        const id = await waCatalog.wa.sendProduct(c.chatId, {
          productId: card.id,
          title: card.name,
          description: card.description,
          price: card.price ?? 0,
          retailerId: card.retailerId,
          url: card.url,
          imageUrl: card.imageUrl,
          imageCount: card.imageCount,
          body,
        });
        await this.store(c, 'bot', `[карточка товара: ${card.name}${card.price ? ` — ${formatTenge(card.price)}` : ''}]${body ? ` ${body}` : ''}`, id);
        return `Карточка «${card.name}» отправлена.`;
      },
      sendCatalogLink: async (text: string) => {
        if (!waCatalog) throw AppError.conflict('Каталог WhatsApp не подключён');
        const phone = (await whatsapp.status()).phone;
        if (!phone) throw AppError.conflict('Номер WhatsApp не привязан');
        const cards = await waCatalog.service.approvedCards();
        if (!cards.length) throw AppError.conflict('В каталоге WhatsApp пока нет одобренных товаров — опиши словами');
        const url = catalogLink(phone);
        const message = `${text.trim()}\n${url}`.trim();
        const id = await waCatalog.wa.sendCatalogLink(c.chatId, message, { title: 'Каталог студии', description: cards.map((p) => p.name).slice(0, 3).join(', '), imageUrl: cards[0]?.imageUrl ?? null });
        await this.store(c, 'bot', message, id);
        return 'Ссылка на каталог отправлена.';
      },
      handOff: async (code: HandoffReason, summaryText: string) => {
        const fresh = (await repository.get(c.id)) ?? c;
        await this.handOff(fresh, code, summaryText);
        await repository.update(fresh);
      },
    };
  }

  private async handOff(c: Conversation, code: HandoffReason, summaryText: string) {
    handOff(c, `${HANDOFF_REASONS[code]}. ${summaryText}`.trim());
    const who = c.name || (c.phone ? `+${c.phone}` : c.chatId);
    await this.alertStudio(`🙋 ${HANDOFF_REASONS[code]} — ${who}${c.phone ? ` (wa.me/${c.phone})` : ''}\n${summaryText}`.trim());
  }

  private async alertStudio(text: string) {
    const { studioPhone, whatsapp, log } = this.deps;
    if (!studioPhone || !whatsapp.enabled) return log.warn({ text }, 'studio alert (no STUDIO_PHONE)');
    await whatsapp.sendText(studioPhone, text).catch((error: Error) => log.error({ err: error }, 'studio alert failed'));
  }

  // ---------- Notifications ----------

  async handleStatusChanged(event: EventEnvelope<'projects.status_changed'>, now = new Date()) {
    const { repository, projects, catalog, links, whatsapp, log } = this.deps;
    if (!(await repository.markProcessed(event.id))) return;
    if (now.getTime() - new Date(event.occurredAt).getTime() > STALE_EVENT_MS) return;
    const to = ProjectStatus.safeParse(event.data.to);
    if (!to.success || !whatsapp.enabled) return;

    const project = await projects.byId(event.data.projectId);
    const product = await catalog.product(project.productId);
    const text = statusMessage(to.data, {
      productName: product.name,
      subject: project.subject,
      customerName: project.customer.name,
      workspaceUrl: links.workspace(project.productId, project.editKey),
      inviteUrl: links.invite(project.productId, project.inviteKey),
      balance: Math.max(0, project.quote.total - project.paidAmount),
      productionDays: product.productionDays,
    }, event.data.from);
    if (!text) return;

    // Orders from the site reach the customer too: the chat is found (or opened) by the order's phone.
    const linked = await repository.projectLink(project.id);
    const c = linked ? await repository.get(linked.conversationId) : null;
    const chatId = c?.chatId ?? normalizePhone(project.customer.phone);
    if (!chatId) return log.warn({ projectId: project.id }, 'no phone to notify');
    const conversation = c ?? (await this.conversation(chatId, project.customer.name));
    if (!linked) {
      await repository.linkProject({ projectId: project.id, conversationId: conversation.id, productId: project.productId as ProductId, editKey: project.editKey, inviteKey: project.inviteKey });
    }
    await this.send(conversation, 'system', text);
    await repository.update(conversation);
    if ((to.data === 'deposit_paid' && event.data.from === 'draft') || to.data === 'paid') {
      await this.alertStudio(`💰 ${to.data === 'paid' ? 'Оплачен остаток' : 'Предоплата'}: «${product.name}» — ${project.subject}, ${project.customer.name}`);
    }
  }

  // ---------- Studio (/admin) ----------

  async whatsappStatus(): Promise<WhatsAppStatus> {
    const { whatsapp, agent } = this.deps;
    if (!whatsapp.enabled) return { enabled: false, reachable: false, loggedIn: false, phone: null, botEnabled: !!agent, problem: null };
    const s = await whatsapp.status();
    return { enabled: true, ...s, botEnabled: !!agent };
  }

  async whatsappQr() {
    this.requireWhatsApp();
    await this.deps.whatsapp.connect();
    return this.deps.whatsapp.loginQr();
  }

  async whatsappLogout() {
    this.requireWhatsApp();
    await this.deps.whatsapp.logout();
    return this.whatsappStatus();
  }

  async listConversations(): Promise<ConversationSummary[]> {
    const rows = await this.deps.repository.list(200);
    return rows.map(({ conversation: c, lastMessage, projectsCount }) => ({ ...summary(c), lastMessage, projectsCount }));
  }

  async conversationView(id: string): Promise<ConversationView> {
    const { repository } = this.deps;
    const c = await repository.get(id);
    if (!c) throw AppError.notFound('Диалог');
    const [history, linked] = await Promise.all([repository.history(id, 500), repository.projects(id)]);
    return {
      ...summary(c),
      lastMessage: history.at(-1)?.text ?? null,
      projectsCount: linked.length,
      messages: history.map((m) => ({ id: m.id, author: m.author, text: m.text, createdAt: m.createdAt.toISOString() })),
      projects: linked.map((p) => ({ projectId: p.projectId, productId: p.productId, editKey: p.editKey })),
    };
  }

  async studioReply(id: string, text: string) {
    this.requireWhatsApp();
    const c = await this.deps.repository.get(id);
    if (!c) throw AppError.notFound('Диалог');
    await this.send(c, 'studio', text);
    pauseForHuman(c);
    c.pending = false;
    await this.deps.repository.update(c);
    return this.conversationView(id);
  }

  async setMode(id: string, mode: 'bot' | 'human') {
    const c = await this.deps.repository.get(id);
    if (!c) throw AppError.notFound('Диалог');
    if (mode === 'bot') {
      c.mode = 'bot';
      c.botPausedUntil = null;
      c.handoffReason = null;
      c.botTurns = 0;
    } else {
      handOff(c, 'Студия взяла диалог на себя');
    }
    await this.deps.repository.update(c);
    return this.conversationView(id);
  }

  /** Trial dialog for the studio: real model and catalog; orders, invoices, cards and hand-offs are only described. */
  async trial(messages: { author: 'customer' | 'bot'; text: string }[]) {
    const { agent, catalog } = this.deps;
    if (!agent) throw AppError.conflict('ИИ-продажник не настроен (ANTHROPIC_API_KEY)');
    const now = new Date();
    const conversation: Conversation = {
      id: randomUUID(), chatId: '77000000000', phone: '77000000000', name: 'Пробный клиент', mode: 'bot', botPausedUntil: null,
      handoffReason: null, pending: true, botTurns: 0, followUps: 0, lastCustomerAt: now, lastMessageAt: now, createdAt: now,
    };
    const history: ChatMessage[] = messages.map((m, i) => ({
      id: String(i), conversationId: conversation.id, author: m.author, text: m.text, externalId: null, createdAt: now,
    }));
    const actions: string[] = [];
    const real = this.toolsFor(conversation);
    const tools: SellerTools = {
      products: () => catalog.products(),
      orders: async () => [],
      orderBriefs: async () => [],
      createOrder: async (input) => {
        actions.push(`Оформил бы заказ: ${input.productId}/${input.formatId} про «${input.subject}» на имя ${input.customerName}`);
        throw AppError.conflict('Пробный режим: заказ не создаётся. Скажи клиенту, что заказ оформлен бы был, и продолжи.');
      },
      sendInvoice: async (projectId, kind) => {
        actions.push(`Выставил бы счёт ${kind} по заказу ${projectId}`);
        throw AppError.conflict('Пробный режим: счёт не выставляется.');
      },
      links: async () => ({ workspaceUrl: this.deps.links.brand('glossy'), inviteUrl: this.deps.links.brand('glossy') }),
      catalogCards: () => real.catalogCards(),
      sendProductCard: async (productId, formatId) => {
        actions.push(`Отправил бы карточку ${productId}/${formatId} из каталога WhatsApp`);
        return 'Пробный режим: карточка показана студии, клиенту не ушла.';
      },
      sendCatalogLink: async () => {
        actions.push('Отправил бы ссылку на каталог WhatsApp');
        return 'Пробный режим: ссылка не ушла.';
      },
      handOff: async (code, summaryText) => {
        actions.push(`Передал бы чат студии: ${HANDOFF_REASONS[code]} — ${summaryText}`);
      },
    };
    const result = await agent.reply({ conversation, history, tools, now, mode: 'reply', purpose: 'trial', check: await this.checker(conversation) });
    return { reply: result.text ? toWhatsApp(stripForeignLinks(result.text, this.deps.links.allowedOrigins())) : null, actions };
  }

  // ---------- internals ----------

  private requireWhatsApp() {
    if (!this.deps.whatsapp.enabled) throw AppError.conflict('WhatsApp не настроен (GOWA_API_URL)');
  }

  private async conversation(chatId: string, name: string): Promise<Conversation> {
    const existing = await this.deps.repository.findByChat(chatId);
    if (existing) return existing;
    const now = new Date();
    const c: Conversation = {
      id: randomUUID(),
      chatId,
      phone: phoneFromChatId(chatId),
      name,
      mode: 'bot',
      botPausedUntil: null,
      handoffReason: null,
      pending: false,
      botTurns: 0,
      followUps: 0,
      lastCustomerAt: null,
      lastMessageAt: now,
      createdAt: now,
    };
    await this.deps.repository.insert(c);
    return c;
  }

  private async store(c: Conversation, author: Author, text: string, externalId: string | null, at = new Date()) {
    const added = await this.deps.repository.addMessage({ id: randomUUID(), conversationId: c.id, author, text, externalId, createdAt: at });
    if (added) c.lastMessageAt = at;
    return added;
  }

  private async send(c: Conversation, author: Author, text: string) {
    const externalId = await this.deps.whatsapp.sendText(c.chatId, text);
    await this.store(c, author, text, externalId);
  }
}

/** Markdown habits of the model → WhatsApp formatting (**bold** → *bold*, no # headings). */
export function toWhatsApp(text: string) {
  return text.replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/^#{1,6}\s+/gm, '');
}

/** The customer's messages since our last one. */
function lastCustomerText(history: ChatMessage[]) {
  const out: string[] = [];
  for (let i = history.length - 1; i >= 0 && history[i]!.author === 'customer'; i--) out.unshift(history[i]!.text);
  return out.join('\n');
}

function summary(c: Conversation) {
  return {
    id: c.id,
    chatId: c.chatId,
    phone: c.phone,
    name: c.name,
    mode: c.mode,
    handoffReason: c.handoffReason,
    lastMessageAt: c.lastMessageAt.toISOString(),
  };
}
