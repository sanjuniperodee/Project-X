import type {
  AdminProjectPage,
  AdminProjectQuery,
  AdminStats,
  CustomerPage,
  ProjectNote,
  Answers,
  CreatePaymentRequest,
  EventEnvelope,
  PaymentView,
  Product,
  ProductId,
} from '@px/contracts';
import type { Layout } from '../domain/layout';
import type { Project, StatusChange } from '../domain/project';

export interface ContributionRecord {
  id: string;
  projectId: string;
  authorName: string;
  answers: Answers;
  createdAt: Date;
}

export interface StatusChangeRecord extends StatusChange {
  createdAt: Date;
}

/** Operations available inside one database transaction (unit of work). */
export interface ProjectTransaction {
  /** Loads a project and locks its row until the transaction ends. */
  lock(by: { id: string } | { editKey: string }): Promise<Project | null>;
  insert(project: Project): Promise<void>;
  update(project: Project): Promise<void>;
  addContribution(contribution: Omit<ContributionRecord, 'id' | 'createdAt'>): Promise<ContributionRecord>;
  recordStatusChange(projectId: string, change: StatusChange): Promise<void>;
  /** Stores an event in the outbox; it is published after commit by the relay. */
  enqueue(envelope: EventEnvelope): Promise<void>;
  /** Returns false when the incoming event was already handled (idempotency). */
  markProcessed(eventId: string): Promise<boolean>;
  /** Newest layout version of the project. */
  latestLayout(projectId: string): Promise<Layout | null>;
  /** Inserts a layout; returns false when this version already exists. */
  insertLayout(layout: Layout): Promise<boolean>;
  updateLayout(layout: Layout): Promise<void>;
}

export interface ProjectRepository {
  transaction<T>(work: (tx: ProjectTransaction) => Promise<T>): Promise<T>;
  findById(id: string): Promise<Project | null>;
  findByEditKey(editKey: string): Promise<Project | null>;
  findByInviteKey(inviteKey: string): Promise<Project | null>;
  contributions(projectId: string): Promise<ContributionRecord[]>;
  countContributions(projectId: string): Promise<number>;
  history(projectId: string): Promise<StatusChangeRecord[]>;
  /** Layout versions, newest first. */
  layouts(projectId: string): Promise<Layout[]>;
}

/** Read models of the studio back office (lists, dashboard, customers, notes). */
export interface BackOfficeQueries {
  projects(query: AdminProjectQuery): Promise<AdminProjectPage>;
  stats(): Promise<AdminStats>;
  customers(query: { q?: string; limit: number; offset: number }): Promise<CustomerPage>;
  notes(projectId: string): Promise<ProjectNote[]>;
  addNote(projectId: string, note: { text: string; author: string | null }): Promise<void>;
}

export interface CatalogGateway {
  product(id: ProductId): Promise<Product>;
}

export interface PaymentsGateway {
  createPayment(request: CreatePaymentRequest): Promise<PaymentView>;
}
