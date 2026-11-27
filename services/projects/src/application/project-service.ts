import { randomUUID } from 'node:crypto';
import {
  calculateQuote,
  contributorSteps,
  ownerSteps,
  QuoteError,
  validateStep,
  type AdminProjectView,
  type Answers,
  type ContributionRequest,
  type CreateProjectRequest,
  type CreateProjectResponse,
  type EventEnvelope,
  type InviteView,
  type PaymentKind,
  type Product,
  type ProductId,
  type ProjectListItem,
  type ProjectStatus,
  type ProjectView,
  type StepAnswers,
} from '@px/contracts';
import { AppError, createEnvelope } from '@px/service-kit';
import { generateKey } from '../domain/keys';
import {
  amountDue,
  applyPayment,
  assertAcceptsContributions,
  attachDraft,
  manualTransition,
  saveStepAnswers,
  transition,
  type Project,
  type StatusChange,
} from '../domain/project';
import type { CatalogGateway, PaymentsGateway, ProjectRepository, ProjectTransaction } from './ports';

export interface ProjectServiceDeps {
  repository: ProjectRepository;
  catalog: CatalogGateway;
  payments: PaymentsGateway;
  /** Absolute URL of the owner's workspace on the frontend. */
  workspaceUrl: (project: { productId: ProductId; editKey: string }) => string;
}

const PAYMENT_TITLES: Record<PaymentKind, string> = { deposit: 'Предоплата', balance: 'Оплата остатка' };

/** Use cases of the projects service. HTTP routes and event handlers are thin adapters over this class. */
export class ProjectService {
  constructor(private readonly deps: ProjectServiceDeps) {}

  // ---------- Owner ----------

  async create(request: CreateProjectRequest): Promise<CreateProjectResponse> {
    const product = await this.deps.catalog.product(request.productId);
    let quote;
    try {
      quote = calculateQuote(product, request.selection);
    } catch (error) {
      if (error instanceof QuoteError) throw AppError.validation({ selection: error.message });
      throw error;
    }

    const now = new Date();
    const project: Project = {
      id: randomUUID(),
      productId: product.id,
      subject: request.subject,
      status: 'draft',
      quote,
      customer: request.customer,
      answers: {},
      draft: null,
      editKey: generateKey(),
      inviteKey: generateKey(),
      paidAmount: 0,
      createdAt: now,
      updatedAt: now,
      submittedAt: null,
    };

    await this.deps.repository.transaction(async (tx) => {
      await tx.insert(project);
      await this.recordChange(tx, project, { from: null, to: 'draft', note: 'Заказ создан' });
    });
    return { id: project.id, editKey: project.editKey, inviteKey: project.inviteKey };
  }

  async view(editKey: string): Promise<ProjectView> {
    const project = await this.deps.repository.findByEditKey(editKey);
    if (!project) throw AppError.notFound('Проект');
    return this.toView(project);
  }

  async saveStep(editKey: string, stepId: string, answers: StepAnswers): Promise<ProjectView> {
    const project = await this.requireByEditKey(editKey);
    const product = await this.deps.catalog.product(project.productId);
    const step = ownerSteps(product).find((s) => s.id === stepId);
    if (!step) throw AppError.notFound('Шаг анкеты');

    const result = validateStep(step, answers, 'draft');
    if (!result.ok) throw AppError.validation(result.errors);

    const saved = await this.deps.repository.transaction(async (tx) => {
      const locked = await this.lock(tx, { editKey });
      saveStepAnswers(locked, step.id, result.data);
      await tx.update(locked);
      return locked;
    });
    return this.toView(saved);
  }

  /** Sends the collected materials to the studio and starts AI draft generation. */
  async submit(editKey: string): Promise<ProjectView> {
    const project = await this.requireByEditKey(editKey);
    const product = await this.deps.catalog.product(project.productId);
    this.assertOwnerStepsComplete(product, project.answers);

    const submitted = await this.deps.repository.transaction(async (tx) => {
      const locked = await this.lock(tx, { editKey });
      if (locked.status === 'draft') {
        throw AppError.conflict('Сначала внесите предоплату — после неё проект уходит дизайнеру');
      }
      const change = transition(locked, 'in_design', 'Материалы отправлены дизайнеру');
      await tx.update(locked);
      await this.recordChange(tx, locked, change);

      const contributions = await this.deps.repository.contributions(locked.id);
      await tx.enqueue(
        createEnvelope('projects.submitted', {
          projectId: locked.id,
          productId: locked.productId,
          subject: locked.subject,
          formatId: locked.quote.formatId,
          answers: locked.answers,
          contributions: contributions.map((c) => ({
            id: c.id,
            authorName: c.authorName,
            answers: c.answers,
            createdAt: c.createdAt.toISOString(),
          })),
        }),
      );
      return locked;
    });
    return this.toView(submitted);
  }

  async checkout(editKey: string, kind: PaymentKind) {
    const project = await this.requireByEditKey(editKey);
    const product = await this.deps.catalog.product(project.productId);
    const amount = amountDue(project, kind);

    const payment = await this.deps.payments.createPayment({
      projectId: project.id,
      kind,
      amount,
      description: `${PAYMENT_TITLES[kind]}: ${product.name} — ${project.subject}`,
      returnUrl: `${this.deps.workspaceUrl(project)}?payment=${kind}`,
    });
    return { paymentId: payment.id, redirectUrl: payment.redirectUrl };
  }

  // ---------- Contributors ----------

  async invite(inviteKey: string): Promise<InviteView> {
    const project = await this.deps.repository.findByInviteKey(inviteKey);
    if (!project) throw AppError.notFound('Приглашение');
    const product = await this.deps.catalog.product(project.productId);
    return {
      productId: project.productId,
      subject: project.subject,
      ownerName: project.customer.name,
      acceptingContributions:
        product.collaboration.enabled && (project.status === 'draft' || project.status === 'deposit_paid'),
      contributionsCount: await this.deps.repository.countContributions(project.id),
    };
  }

  async contribute(inviteKey: string, request: ContributionRequest): Promise<{ id: string }> {
    const project = await this.deps.repository.findByInviteKey(inviteKey);
    if (!project) throw AppError.notFound('Приглашение');
    const product = await this.deps.catalog.product(project.productId);
    if (!product.collaboration.enabled) throw AppError.forbidden('Этот продукт не собирается вместе');

    const steps = contributorSteps(product);
    const answers: Answers = {};
    const errors: Record<string, string> = {};
    for (const step of steps) {
      const result = validateStep(step, request.answers[step.id] ?? {}, 'final');
      if (result.ok) answers[step.id] = result.data;
      else for (const [path, message] of Object.entries(result.errors)) errors[`${step.id}.${path}`] = message;
    }
    if (Object.keys(errors).length > 0) throw AppError.validation(errors);

    return this.deps.repository.transaction(async (tx) => {
      const locked = await this.lock(tx, { id: project.id });
      assertAcceptsContributions(locked);
      const contribution = await tx.addContribution({
        projectId: locked.id,
        authorName: request.authorName,
        answers,
      });
      return { id: contribution.id };
    });
  }

  // ---------- Studio back office ----------

  async list(filter: { status?: ProjectStatus; limit?: number }): Promise<ProjectListItem[]> {
    return this.deps.repository.list({ status: filter.status, limit: Math.min(filter.limit ?? 100, 500) });
  }

  async adminView(id: string): Promise<AdminProjectView> {
    const project = await this.deps.repository.findById(id);
    if (!project) throw AppError.notFound('Проект');
    return { ...(await this.toView(project)), editKey: project.editKey };
  }

  async changeStatus(id: string, to: ProjectStatus, note: string | null): Promise<AdminProjectView> {
    await this.deps.repository.transaction(async (tx) => {
      const locked = await this.lock(tx, { id });
      const change = manualTransition(locked, to, note);
      await tx.update(locked);
      await this.recordChange(tx, locked, change);
    });
    return this.adminView(id);
  }

  // ---------- Integration events ----------

  async handlePaymentSucceeded(event: EventEnvelope<'payments.succeeded'>): Promise<void> {
    await this.deps.repository.transaction(async (tx) => {
      if (!(await tx.markProcessed(event.id))) return;
      const project = await this.lock(tx, { id: event.data.projectId });
      const change = applyPayment(project, event.data.kind, event.data.amount);
      await tx.update(project);
      if (change) await this.recordChange(tx, project, change);
    });
  }

  async handleDraftGenerated(event: EventEnvelope<'ai.draft_generated'>): Promise<void> {
    const { projectId, draft, generator } = event.data;
    await this.deps.repository.transaction(async (tx) => {
      if (!(await tx.markProcessed(event.id))) return;
      const project = await this.lock(tx, { id: projectId });
      attachDraft(project, { ...draft, generator, generatedAt: event.occurredAt });
      await tx.update(project);
    });
  }

  // ---------- Helpers ----------

  private async requireByEditKey(editKey: string): Promise<Project> {
    const project = await this.deps.repository.findByEditKey(editKey);
    if (!project) throw AppError.notFound('Проект');
    return project;
  }

  private async lock(tx: ProjectTransaction, by: { id: string } | { editKey: string }): Promise<Project> {
    const project = await tx.lock(by);
    if (!project) throw AppError.notFound('Проект');
    return project;
  }

  private async recordChange(tx: ProjectTransaction, project: Project, change: StatusChange): Promise<void> {
    await tx.recordStatusChange(project.id, change);
    await tx.enqueue(
      createEnvelope('projects.status_changed', {
        projectId: project.id,
        productId: project.productId,
        from: change.from,
        to: change.to,
      }),
    );
  }

  private assertOwnerStepsComplete(product: Product, answers: Answers): void {
    const errors: Record<string, string> = {};
    for (const step of ownerSteps(product)) {
      const result = validateStep(step, answers[step.id] ?? {}, 'final');
      if (!result.ok) {
        for (const [path, message] of Object.entries(result.errors)) errors[`${step.id}.${path}`] = message;
      }
    }
    if (Object.keys(errors).length > 0) {
      throw AppError.validation(errors, 'Заполните обязательные поля анкеты перед отправкой');
    }
  }

  private async toView(project: Project): Promise<ProjectView> {
    const [contributions, history] = await Promise.all([
      this.deps.repository.contributions(project.id),
      this.deps.repository.history(project.id),
    ]);
    return {
      id: project.id,
      productId: project.productId,
      subject: project.subject,
      status: project.status,
      quote: project.quote,
      customer: project.customer,
      answers: project.answers,
      contributions: contributions.map((c) => ({
        id: c.id,
        authorName: c.authorName,
        answers: c.answers,
        createdAt: c.createdAt.toISOString(),
      })),
      draft: project.draft,
      inviteKey: project.inviteKey,
      paidAmount: project.paidAmount,
      history: history.map((h) => ({ from: h.from, to: h.to, note: h.note, createdAt: h.createdAt.toISOString() })),
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }
}
