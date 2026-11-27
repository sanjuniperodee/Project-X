import {
  canTransition,
  isEditable,
  PAYMENT_DRIVEN_STATUSES,
  PROJECT_STATUS_LABELS,
  type Answers,
  type Customer,
  type Draft,
  type PaymentKind,
  type ProductId,
  type ProjectStatus,
  type Quote,
  type StepAnswers,
} from '@px/contracts';

/**
 * Project aggregate and its business rules. Pure code: no I/O, no framework.
 * Every state change goes through these functions, which keeps the rules in one place.
 */
export interface Project {
  id: string;
  productId: ProductId;
  subject: string;
  status: ProjectStatus;
  quote: Quote;
  customer: Customer;
  answers: Answers;
  draft: Draft | null;
  editKey: string;
  inviteKey: string;
  paidAmount: number;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
}

export interface StatusChange {
  from: ProjectStatus | null;
  to: ProjectStatus;
  note: string | null;
}

export type ProjectRuleCode = 'not_editable' | 'invalid_transition' | 'nothing_to_pay' | 'not_accepting_contributions';

/** A business rule was violated by an otherwise well-formed request. */
export class ProjectRuleViolation extends Error {
  override readonly name = 'ProjectRuleViolation';
  constructor(
    readonly code: ProjectRuleCode,
    message: string,
  ) {
    super(message);
  }
}

export function transition(project: Project, to: ProjectStatus, note: string | null = null): StatusChange {
  if (!canTransition(project.status, to)) {
    throw new ProjectRuleViolation(
      'invalid_transition',
      `Нельзя перевести заказ из «${PROJECT_STATUS_LABELS[project.status]}» в «${PROJECT_STATUS_LABELS[to]}»`,
    );
  }
  const change: StatusChange = { from: project.status, to, note };
  project.status = to;
  project.updatedAt = new Date();
  if (to === 'in_design' && !project.submittedAt) project.submittedAt = project.updatedAt;
  return change;
}

export function manualTransition(project: Project, to: ProjectStatus, note: string | null): StatusChange {
  if (PAYMENT_DRIVEN_STATUSES.includes(to)) {
    throw new ProjectRuleViolation('invalid_transition', 'Этот статус выставляется автоматически после оплаты');
  }
  return transition(project, to, note);
}

export function assertEditable(project: Project): void {
  if (!isEditable(project.status)) {
    throw new ProjectRuleViolation('not_editable', 'Материалы уже у дизайнера — изменения можно передать через студию');
  }
}

export function saveStepAnswers(project: Project, stepId: string, answers: StepAnswers): void {
  assertEditable(project);
  project.answers = { ...project.answers, [stepId]: answers };
  project.updatedAt = new Date();
}

export function assertAcceptsContributions(project: Project): void {
  if (!isEditable(project.status)) {
    throw new ProjectRuleViolation('not_accepting_contributions', 'Сбор материалов уже закрыт');
  }
}

/** How much the customer owes right now for a payment of the given kind. */
export function amountDue(project: Project, kind: PaymentKind): number {
  if (kind === 'deposit') {
    if (project.status !== 'draft') {
      throw new ProjectRuleViolation('nothing_to_pay', 'Предоплата уже внесена');
    }
    return project.quote.deposit;
  }
  if (project.status !== 'awaiting_approval') {
    throw new ProjectRuleViolation('nothing_to_pay', 'Оплата остатка откроется, когда макет будет готов');
  }
  const due = project.quote.total - project.paidAmount;
  if (due <= 0) throw new ProjectRuleViolation('nothing_to_pay', 'Заказ уже оплачен полностью');
  return due;
}

/**
 * Applies a confirmed payment. Returns the status change it caused, if any.
 * A payment that arrives in an unexpected state is still recorded (money is never ignored),
 * but the status stays as is so the studio can sort it out.
 */
export function applyPayment(project: Project, kind: PaymentKind, amount: number): StatusChange | null {
  project.paidAmount += amount;
  project.updatedAt = new Date();

  if (kind === 'deposit' && project.status === 'draft') return transition(project, 'deposit_paid', 'Предоплата получена');
  if (kind === 'balance' && project.status === 'awaiting_approval' && project.paidAmount >= project.quote.total) {
    return transition(project, 'paid', 'Заказ оплачен полностью');
  }
  return null;
}

export function attachDraft(project: Project, draft: Draft): void {
  project.draft = draft;
  project.updatedAt = new Date();
}
