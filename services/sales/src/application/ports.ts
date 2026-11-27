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
  list(limit: number): Promise<{ conversation: Conversation; lastMessage: string | null; projectsCount: number }[]>;
  /** true the first time an event id is seen. */
  markProcessed(eventId: string): Promise<boolean>;
}

/** What the AI seller can do in a chat. Amounts and links come from here, never from the model. */
export interface SellerTools {
  products(): Promise<Product[]>;
  orders(): Promise<{ project: ProjectView; link: LinkedProject }[]>;
  createOrder(input: {
    productId: ProductId;
    formatId: string;
    extras: Record<string, number>;
    subject: string;
    customerName: string;
  }): Promise<{ project: ProjectView; workspaceUrl: string; inviteUrl: string }>;
  sendInvoice(projectId: string, kind: PaymentKind): Promise<{ amount: number; phone: string }>;
  links(projectId: string): Promise<{ workspaceUrl: string; inviteUrl: string }>;
  handOff(reason: string): Promise<void>;
}

export interface SellerAgent {
  /** The next bot message for this chat, or null when the bot should stay silent (it handed the chat off). */
  reply(input: { conversation: Conversation; history: ChatMessage[]; tools: SellerTools; now: Date }): Promise<string | null>;
}
