import type {
  AdminProjectView,
  CheckoutResponse,
  CreateProjectRequestInput,
  CreateProjectResponse,
  PaymentKind,
  Product,
  ProductId,
  ProjectView,
} from '@px/contracts';
import type { ChatMessage, Conversation, LinkedProject } from '../domain/conversation';

export interface InboundMessage {
  externalId: string;
  chatId: string;
  text: string;
  contactName: string;
  /** Sent from the studio phone itself (or by us through the gateway). */
  fromMe: boolean;
  at: Date;
}

export interface WhatsAppGatewayStatus {
  reachable: boolean;
  loggedIn: boolean;
  phone: string | null;
  problem: string | null;
}

export interface WhatsAppGateway {
  readonly enabled: boolean;
  /** Returns the WhatsApp message id (its echo comes back through the webhook). */
  sendText(chatId: string, text: string): Promise<string | null>;
  status(): Promise<WhatsAppGatewayStatus>;
  loginQr(): Promise<{ image: string; seconds: number }>;
  logout(): Promise<void>;
  /** Registers the studio device and points its webhook at this service. Safe to repeat. */
  connect(): Promise<void>;
}

export interface CatalogGateway {
  products(): Promise<Product[]>;
  product(id: ProductId): Promise<Product>;
}

export interface ProjectsGateway {
  create(request: CreateProjectRequestInput): Promise<CreateProjectResponse>;
  get(editKey: string): Promise<ProjectView>;
  checkout(editKey: string, kind: PaymentKind): Promise<CheckoutResponse>;
  /** Internal read by id (the projects service is not exposed; the gateway guards /api/admin). */
  byId(projectId: string): Promise<AdminProjectView>;
}

export interface ConversationRepository {
  findByChat(chatId: string): Promise<Conversation | null>;
  get(id: string): Promise<Conversation | null>;
  insert(c: Conversation): Promise<void>;
  update(c: Conversation): Promise<void>;
  /** false when a message with this WhatsApp id is already stored (webhook redelivery). */
  addMessage(m: ChatMessage): Promise<boolean>;
  isOurMessage(externalId: string): Promise<boolean>;
  history(conversationId: string, limit: number): Promise<ChatMessage[]>;
  linkProject(p: LinkedProject): Promise<void>;
  projects(conversationId: string): Promise<LinkedProject[]>;
  projectLink(projectId: string): Promise<LinkedProject | null>;
  pending(): Promise<Conversation[]>;
  /** Our message with this text went out to the chat recently (echo recognised by text, not only by id). */
  recentOurText(conversationId: string, text: string, since: Date): Promise<boolean>;
  /** Bot chats where we wrote last and the customer has been silent since `before`. */
  followUpCandidates(before: Date): Promise<Conversation[]>;
  list(limit: number): Promise<{ conversation: Conversation; lastMessage: string | null; projectsCount: number }[]>;
  /** true the first time an event id is seen. */
  markProcessed(eventId: string): Promise<boolean>;
}

/** Why the bot hands a chat to the studio (MyBooks codes): shown in /admin and in the studio alert. */
export const HANDOFF_REASONS = {
  human_request: 'Клиент просит человека',
  call_request: 'Просит позвонить',
  paid_claim: 'Говорит, что оплатил',
  payment_issue: 'Проблема с оплатой',
  complaint: 'Жалоба',
  custom_request: 'Нестандартный заказ',
  objection: 'Сомневается — нужен человек',
  unsure: 'Бот не уверен в ответе',
  ai_blocked: 'Ответ бота не прошёл проверку',
} as const;
export type HandoffReason = keyof typeof HANDOFF_REASONS;

/** What the AI seller can do in a chat. Amounts and links come from here, never from the model. */
export interface SellerTools {
  products(): Promise<Product[]>;
  orders(): Promise<{ project: ProjectView; link: LinkedProject }[]>;
  /** Plain-words brief of every order of this customer: stage, next step on the site, what is filled and missing. */
  orderBriefs(): Promise<string[]>;
  createOrder(input: {
    productId: ProductId;
    formatId: string;
    extras: Record<string, number>;
    subject: string;
    customerName: string;
  }): Promise<{ project: ProjectView; workspaceUrl: string; inviteUrl: string; reused: boolean }>;
  sendInvoice(projectId: string, kind: PaymentKind): Promise<{ amount: number; phone: string; alreadySent: boolean }>;
  links(projectId: string): Promise<{ workspaceUrl: string; inviteUrl: string }>;
  /** Product cards available in the WhatsApp catalog (approved by WhatsApp). */
  catalogCards(): Promise<{ productId: string; formatId: string; name: string; price: number | null }[]>;
  sendProductCard(productId: string, formatId: string, caption: string): Promise<string>;
  sendCatalogLink(text: string): Promise<string>;
  handOff(code: HandoffReason, summary: string): Promise<void>;
}

export interface SellerReply {
  /** Text for the customer (paragraphs become separate messages); null — stay silent. */
  text: string | null;
  handedOff: boolean;
}

export interface SellerAgent {
  reply(input: {
    conversation: Conversation;
    history: ChatMessage[];
    tools: SellerTools;
    now: Date;
    /** follow_up: the customer went silent after our message — write a gentle reminder or stay silent. */
    mode: 'reply' | 'follow_up';
    /** For the AI spend summary; defaults to the mode. */
    purpose?: 'reply' | 'follow_up' | 'trial';
    /** Problems in a finished text (amounts, details, links); extra amounts — sums the tools returned this turn. */
    check: (text: string, extraAmounts: number[]) => string[];
  }): Promise<SellerReply>;
}

export interface CatalogPhotosRow {
  productId: string;
  images: string[];
  version: number;
  syncedVersion: number;
}

export interface WaProductRow {
  id: string;
  retailerId: string;
  name: string;
  description: string;
  price: number | null;
  url: string;
  review: string;
  imageUrl: string | null;
  imageCount: number;
  syncedAt: Date;
}

export interface CatalogStore {
  photos(): Promise<CatalogPhotosRow[]>;
  setPhotos(productId: string, images: string[]): Promise<void>;
  markPhotosSynced(rows: { productId: string; version: number }[]): Promise<void>;
  /** Replaces the copy of the WhatsApp catalog. */
  replaceProducts(rows: Omit<WaProductRow, 'syncedAt'>[]): Promise<void>;
  products(): Promise<WaProductRow[]>;
}

/** WhatsApp catalog operations (GOWA build with the catalog patch). */
export interface CatalogGatewayWa {
  products(): Promise<import('../domain/catalog').WaProduct[]>;
  create(w: import('../domain/catalog').WantedProduct, imageUrls: string[]): Promise<import('../domain/catalog').WaProduct>;
  edit(id: string, w: import('../domain/catalog').WantedProduct, imageUrls: string[]): Promise<import('../domain/catalog').WaProduct>;
  remove(ids: string[]): Promise<void>;
  /** 'catalog' when the number has a catalog (created in the WhatsApp Business app); null — unknown. */
  commerceExperience(phone: string): Promise<string | null>;
  uploadImages(images: { data: Uint8Array; name: string; mime: string }[]): Promise<string[]>;
  sendProduct(chatId: string, card: { productId: string; title: string; description: string; price: number; retailerId: string; url: string; imageUrl: string | null; imageCount: number; body: string }): Promise<string | null>;
  sendCatalogLink(chatId: string, text: string, preview: { title: string; description: string; imageUrl: string | null }): Promise<string | null>;
}

/** Reads uploaded photos (media service on the private network). */
export interface MediaReader {
  read(publicUrl: string): Promise<{ data: Uint8Array; name: string; mime: string }>;
}
