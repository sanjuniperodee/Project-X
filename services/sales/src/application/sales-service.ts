import { randomUUID } from 'node:crypto';
import {
  type ConversationSummary,
  type ConversationView,
  type EventEnvelope,
  type PaymentKind,
  type ProductId,
  ProjectStatus,
  type WhatsAppStatus,
} from '@px/contracts';
import { AppError, type Logger } from '@px/service-kit';
import {
  BOT_LIMITS,
  botMayAnswer,
  chatIdFromJid,
  handOff,
  normalizePhone,
  pauseForHuman,
  phoneFromChatId,
  type Author,
  type Conversation,
} from '../domain/conversation';
import { stripForeignLinks, type Links } from '../domain/links';
import { statusMessage } from '../domain/notifications';
import type {
  CatalogGateway,
  ConversationRepository,
  InboundMessage,
  ProjectsGateway,
  SellerAgent,
  SellerTools,
  WhatsAppGateway,
} from './ports';

export interface SalesDeps {
  repository: ConversationRepository;
  whatsapp: WhatsAppGateway;
  catalog: CatalogGateway;
  projects: ProjectsGateway;
  /** null: no AI key — chats are handed to the studio. */
  agent: SellerAgent | null;
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

export class SalesService {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly running = new Set<string>();

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
      if (!(await this.store(c, 'studio', message.text, message.externalId, message.at))) return;
      pauseForHuman(c, message.at);
      c.pending = false;
      await repository.update(c);
      return;
    }

    const c = await this.conversation(chatId, message.contactName);
    if (!(await this.store(c, 'customer', message.text, message.externalId, message.at))) return;
    c.pending = true;
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
        if (c.botTurns >= BOT_LIMITS.maxTurns && c.mode === 'bot') await this.handOff(c, 'Длинный диалог: бот достиг лимита ответов');
        await repository.update(c);
        return;
      }
      if (c.mode === 'human') {
        c.mode = 'bot';
        c.botPausedUntil = null;
      }
      if (!agent) {
        await this.handOff(c, 'ИИ-продажник не настроен (нет ключа)');
        await repository.update(c);
        return;
      }
      await repository.update(c);
      const history = await repository.history(c.id, BOT_LIMITS.historyMessages);
      const text = await agent.reply({ conversation: c, history, tools: this.toolsFor(c), now });
      const fresh = (await repository.get(c.id)) ?? c;
      if (text?.trim()) {
        await this.send(fresh, 'bot', stripForeignLinks(text.trim(), this.deps.links.allowedOrigins()));
        fresh.botTurns += 1;
      }
      await repository.update(fresh);
    } finally {
      this.running.delete(conversationId);
    }
  }

  // ---------- Bot tools (amounts and links come from the services, not the model) ----------

  private toolsFor(c: Conversation): SellerTools {
    const { catalog, projects, repository, links } = this.deps;
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
      createOrder: async (input) => {
        const phone = c.phone ?? phoneFromChatId(c.chatId);
        if (!phone) throw AppError.badRequest('Номер скрыт: попросите клиента написать номер телефона для заказа');
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
        };
      },
      sendInvoice: async (projectId: string, kind: PaymentKind) => {
        const link = await own(projectId);
        const project = await projects.get(link.editKey);
        await projects.checkout(link.editKey, kind);
        const due = kind === 'deposit' ? project.quote.deposit : project.quote.total - project.paidAmount;
        return { amount: due, phone: project.customer.phone };
      },
      links: async (projectId: string) => {
        const link = await own(projectId);
        return { workspaceUrl: links.workspace(link.productId, link.editKey), inviteUrl: links.invite(link.productId, link.inviteKey) };
      },
      handOff: async (reason: string) => {
        const fresh = (await repository.get(c.id)) ?? c;
        await this.handOff(fresh, reason);
        await repository.update(fresh);
      },
    };
  }

  private async handOff(c: Conversation, reason: string) {
    handOff(c, reason);
    const who = c.name || c.phone || c.chatId;
    await this.alertStudio(`🙋 Нужен человек в чате с ${who}${c.phone ? ` (+${c.phone})` : ''}: ${reason}`);
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
    });
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
    if (to.data === 'deposit_paid' || to.data === 'paid') {
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

  /** Trial dialog for the studio: real model and catalog; orders, invoices and hand-offs are only described. */
  async trial(messages: { author: 'customer' | 'bot'; text: string }[]) {
    const { agent, catalog } = this.deps;
    if (!agent) throw AppError.conflict('ИИ-продажник не настроен (ANTHROPIC_API_KEY)');
    const now = new Date();
    const conversation: Conversation = {
      id: randomUUID(), chatId: '77000000000', phone: '77000000000', name: 'Пробный клиент', mode: 'bot', botPausedUntil: null,
      handoffReason: null, pending: true, botTurns: 0, lastMessageAt: now, createdAt: now,
    };
    const history = messages.map((m, i) => ({
      id: String(i), conversationId: conversation.id, author: m.author, text: m.text, externalId: null, createdAt: now,
    }));
    const actions: string[] = [];
    const tools: SellerTools = {
      products: () => catalog.products(),
      orders: async () => [],
      createOrder: async (input) => {
        actions.push(`Оформил бы заказ: ${input.productId}/${input.formatId} про «${input.subject}» на имя ${input.customerName}`);
        throw AppError.conflict('Пробный режим: заказ не создаётся. Скажи клиенту, что заказ оформлен бы был, и продолжи.');
      },
      sendInvoice: async (projectId, kind) => {
        actions.push(`Выставил бы счёт ${kind} по заказу ${projectId}`);
        throw AppError.conflict('Пробный режим: счёт не выставляется.');
      },
      links: async () => ({ workspaceUrl: this.deps.links.brand('glossy'), inviteUrl: this.deps.links.brand('glossy') }),
      handOff: async (reason) => {
        actions.push(`Передал бы чат студии: ${reason}`);
      },
    };
    const reply = await agent.reply({ conversation, history, tools, now });
    return { reply: reply ? stripForeignLinks(reply, this.deps.links.allowedOrigins()) : null, actions };
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
