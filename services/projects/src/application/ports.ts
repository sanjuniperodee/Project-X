import type {
  Answers,
  CreatePaymentRequest,
  EventEnvelope,
  PaymentView,
  Product,
  ProductId,
  ProjectListItem,
  ProjectStatus,
} from '@px/contracts';
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
}

export interface ProjectRepository {
  transaction<T>(work: (tx: ProjectTransaction) => Promise<T>): Promise<T>;
  findById(id: string): Promise<Project | null>;
  findByEditKey(editKey: string): Promise<Project | null>;
  findByInviteKey(inviteKey: string): Promise<Project | null>;
  contributions(projectId: string): Promise<ContributionRecord[]>;
  countContributions(projectId: string): Promise<number>;
  history(projectId: string): Promise<StatusChangeRecord[]>;
  list(filter: { status?: ProjectStatus; limit: number }): Promise<ProjectListItem[]>;
}

export interface CatalogGateway {
  product(id: ProductId): Promise<Product>;
}

export interface PaymentsGateway {
  createPayment(request: CreatePaymentRequest): Promise<PaymentView>;
}
