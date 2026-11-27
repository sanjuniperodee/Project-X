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
  type LayoutSource,
  type LayoutView,
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
  acceptLayout,
  approveLayout,
  assertLayoutApproved,
  handOverToStudio,
  requestLayoutChanges,
  type Layout,
} from '../domain/layout';
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
  /** Automatic revision rounds before a project goes to a designer. */
  revisionsLimit: number;
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
      designMode: 'auto',
      revisionsUsed: 0,
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
      const change = transition(locked, 'in_design', 'Материалы отправлены на вёрстку');
      await tx.update(locked);
      await this.recordChange(tx, locked, change);

      await tx.enqueue(createEnvelope('projects.submitted', await this.materials(locked)));
      return locked;
    });
    return this.toView(submitted);
  }

  async checkout(editKey: string, kind: PaymentKind) {
    const project = await this.requireByEditKey(editKey);
    const product = await this.deps.catalog.product(project.productId);
    const amount = amountDue(project, kind);
    if (kind === 'balance') assertLayoutApproved((await this.deps.repository.layouts(project.id))[0] ?? null);

    const payment = await this.deps.payments.createPayment({
      projectId: project.id,
      kind,
      amount,
      description: `${PAYMENT_TITLES[kind]}: ${product.name} — ${project.subject}`,
      returnUrl: `${this.deps.workspaceUrl(project)}?payment=${kind}`,
      customerPhone: project.customer.phone,
    });
    return { paymentId: payment.id, redirectUrl: payment.redirectUrl };
  }

  // ---------- Layout decisions ----------

  /** The customer approves the layout version they looked at; the balance payment opens. */
  async approveLayout(editKey: string, version: number): Promise<ProjectView> {
    const project = await this.deps.repository.transaction(async (tx) => {
      const locked = await this.lock(tx, { editKey });
      const layout = await tx.latestLayout(locked.id);
      approveLayout(locked, layout, version);
      await tx.updateLayout(layout!);
      await tx.update(locked);
      await tx.enqueue(
        createEnvelope('projects.layout_approved', { projectId: locked.id, productId: locked.productId, version }),
      );
      return locked;
    });
    return this.toView(project);
  }

  /**
   * The customer asks for changes. Within the limit the draft is rewritten by the AI and laid out again;
   * after that, or if the layout came from the studio, a designer takes over.
   */
  async requestLayoutChanges(editKey: string, version: number | null, comment: string): Promise<ProjectView> {
    const project = await this.deps.repository.transaction(async (tx) => {
      const locked = await this.lock(tx, { editKey });
      const layout = await tx.latestLayout(locked.id);
      // Without a draft to rewrite there is nothing to regenerate automatically.
      const limit = locked.draft ? this.deps.revisionsLimit : 0;
      const outcome = requestLayoutChanges(locked, layout, version, comment, limit);
      if (layout) await tx.updateLayout(layout);
      await tx.update(locked);
      await this.recordChange(tx, locked, outcome.change);
      if (outcome.next === 'auto' && locked.draft && layout) {
        const { title, lead, sections, cards } = locked.draft;
        await tx.enqueue(
          createEnvelope('projects.revision_requested', {
            ...(await this.materials(locked)),
            revision: outcome.revision!,
            layoutVersion: layout.version,
            comment,
            draft: { title, lead, sections, cards },
          }),
        );
      } else {
        await tx.enqueue(
          createEnvelope('projects.design_handoff', {
            projectId: locked.id,
            productId: locked.productId,
            reason:
              layout?.status === 'changes_requested'
                ? `Лимит автоматических правок исчерпан (${locked.revisionsUsed} из ${limit}). Клиент просит: ${comment}`
                : `Клиент просит правки: ${comment}`,
          }),
        );
      }
      return locked;
    });
    return this.toView(project);
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
    const [view, layouts] = await Promise.all([this.toView(project), this.deps.repository.layouts(project.id)]);
    return { ...view, editKey: project.editKey, layouts: layouts.map(toLayoutView) };
  }

  async changeStatus(id: string, to: ProjectStatus, note: string | null): Promise<AdminProjectView> {
    await this.deps.repository.transaction(async (tx) => {
      const locked = await this.lock(tx, { id });
      const change = manualTransition(locked, to, note);
      // A manual move takes the project out of the automatic loop: the studio decides from here.
      const layout = await tx.latestLayout(locked.id);
      if (layout?.status === 'pending') {
        layout.status = 'discarded';
        layout.decidedAt = new Date();
        await tx.updateLayout(layout);
      }
      if (to === 'in_design') locked.designMode = 'studio';
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

  async handleLayoutGenerated(event: EventEnvelope<'layout.generated'>): Promise<void> {
    const { projectId, version, pdfUrl, pages, template, warnings } = event.data;
    await this.deps.repository.transaction(async (tx) => {
      if (!(await tx.markProcessed(event.id))) return;
      const project = await this.lock(tx, { id: projectId });
      const { layout, change } = acceptLayout(project, { version, pdfUrl, pages, template, warnings });
      // The same version twice (a re-generated draft) is ignored: the first one is already shown.
      if (!(await tx.insertLayout(layout))) return;
      await tx.update(project);
      if (change) await this.recordChange(tx, project, change);
    });
  }

  async handleLayoutFailed(event: EventEnvelope<'layout.failed'>): Promise<void> {
    await this.deps.repository.transaction(async (tx) => {
      if (!(await tx.markProcessed(event.id))) return;
      const project = await this.lock(tx, { id: event.data.projectId });
      if (!handOverToStudio(project)) return;
      await tx.update(project);
      await tx.enqueue(
        createEnvelope('projects.design_handoff', {
          projectId: project.id,
          productId: project.productId,
          reason: `Автоматическая вёрстка не удалась: ${event.data.reason}`.slice(0, 1000),
        }),
      );
    });
  }

  // ---------- Internal ----------

  /** What the layout service needs to typeset a project. */
  async layoutSource(id: string): Promise<LayoutSource> {
    const project = await this.deps.repository.findById(id);
    if (!project) throw AppError.notFound('Проект');
    const [materials, layouts] = await Promise.all([this.materials(project), this.deps.repository.layouts(id)]);
    return {
      ...materials,
      status: project.status,
      designMode: project.designMode,
      nextVersion: (layouts[0]?.version ?? 0) + 1,
    };
  }

  // ---------- Helpers ----------

  private async materials(project: Project) {
    const contributions = await this.deps.repository.contributions(project.id);
    return {
      projectId: project.id,
      productId: project.productId,
      subject: project.subject,
      formatId: project.quote.formatId,
      answers: project.answers,
      contributions: contributions.map((c) => ({
        id: c.id,
        authorName: c.authorName,
        answers: c.answers,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }


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
    const [contributions, history, layouts] = await Promise.all([
      this.deps.repository.contributions(project.id),
      this.deps.repository.history(project.id),
      this.deps.repository.layouts(project.id),
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
      layout: layouts[0] ? toLayoutView(layouts[0]) : null,
      design: { mode: project.designMode, revisionsUsed: project.revisionsUsed, revisionsLimit: this.deps.revisionsLimit },
      inviteKey: project.inviteKey,
      paidAmount: project.paidAmount,
      history: history.map((h) => ({ from: h.from, to: h.to, note: h.note, createdAt: h.createdAt.toISOString() })),
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }
}

function toLayoutView(layout: Layout): LayoutView {
  return {
    version: layout.version,
    status: layout.status,
    pdfUrl: layout.pdfUrl,
    pages: layout.pages,
    template: layout.template,
    warnings: layout.warnings,
    feedback: layout.feedback,
    createdAt: layout.createdAt.toISOString(),
    decidedAt: layout.decidedAt?.toISOString() ?? null,
  };
}
