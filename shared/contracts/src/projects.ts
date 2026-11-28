import { z } from 'zod';
import { Draft, DraftContent } from './drafts';
import { Answers, StepAnswers } from './fields';
import { DesignMode, DesignState, LayoutPage, LayoutView } from './layouts';
import { ProductId } from './products';
import { Quote, QuoteSelection } from './quote';

/**
 * Project lifecycle (an order for one personalised printed product).
 *
 *  draft ──deposit──▶ deposit_paid ──submit──▶ in_design ──studio──▶ awaiting_approval
 *                                                   ▲                       │
 *                                                   └──── changes ──────────┤
 *                                                                           ▼ balance
 *                     delivered ◀── shipped ◀── printing ◀──────────────── paid
 *
 *  Any state before `paid` can be cancelled by the studio.
 */
export const ProjectStatus = z.enum([
  'draft',
  'deposit_paid',
  'in_design',
  'awaiting_approval',
  'paid',
  'printing',
  'shipped',
  'delivered',
  'cancelled',
]);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

export const PROJECT_TRANSITIONS: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> = {
  draft: ['deposit_paid', 'cancelled'],
  deposit_paid: ['in_design', 'cancelled'],
  // → deposit_paid: the customer takes the questionnaire back once (see ProjectView.canReopen).
  in_design: ['awaiting_approval', 'deposit_paid', 'cancelled'],
  awaiting_approval: ['in_design', 'deposit_paid', 'paid', 'cancelled'],
  paid: ['printing'],
  printing: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return PROJECT_TRANSITIONS[from].includes(to);
}

/** Paid in full: from here the order goes to print and delivery. */
export const PROJECT_STATUSES_PAID: readonly ProjectStatus[] = ['paid', 'printing', 'shipped', 'delivered'];

/** Orders the studio still works on (not delivered, not cancelled). */
export const PROJECT_STATUSES_ACTIVE: readonly ProjectStatus[] = ['draft', 'deposit_paid', 'in_design', 'awaiting_approval', 'paid', 'printing', 'shipped'];

/** Statuses reached only through confirmed payments — the studio can never set them by hand. */
export const PAYMENT_DRIVEN_STATUSES: readonly ProjectStatus[] = ['deposit_paid', 'paid'];

/** Status changes the studio may make manually from the back office. */
export function manualTransitions(from: ProjectStatus): ProjectStatus[] {
  return PROJECT_TRANSITIONS[from].filter((to) => !PAYMENT_DRIVEN_STATUSES.includes(to));
}

/** Customer-facing labels, so every app shows the same wording. */
export const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  draft: 'Ждёт предоплату',
  deposit_paid: 'Собираем материалы',
  in_design: 'Верстаем макет',
  awaiting_approval: 'Макет готов — ждёт вашего согласования',
  paid: 'Оплачено, готовим к печати',
  printing: 'В типографии',
  shipped: 'В пути',
  delivered: 'Доставлено',
  cancelled: 'Отменён',
};

/** Content can be edited until the project goes to the designer. */
export function isEditable(status: ProjectStatus): boolean {
  return status === 'draft' || status === 'deposit_paid';
}

export const Phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[^\d+]/g, ''))
  .pipe(z.string().regex(/^\+?\d{10,15}$/, 'Укажите номер телефона, например +7 701 234 56 78'));

export const Customer = z.object({
  name: z.string().trim().min(2, 'Как к вам обращаться?').max(80),
  phone: Phone,
  email: z.email('Проверьте email').optional().or(z.literal('').transform(() => undefined)),
});
export type Customer = z.infer<typeof Customer>;

// ---------- Requests ----------

export const CreateProjectRequest = z.object({
  productId: ProductId,
  /** Who the gift is about: "Айгерим", "Семья Сейткалиевых", "Отдел маркетинга". */
  subject: z.string().trim().min(2, 'Напишите, о ком будет подарок').max(80),
  selection: QuoteSelection,
  customer: Customer,
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequest>;
export type CreateProjectRequestInput = z.input<typeof CreateProjectRequest>;

export const SaveStepRequest = z.object({
  answers: StepAnswers,
});
export type SaveStepRequest = z.infer<typeof SaveStepRequest>;

export const ContributionRequest = z.object({
  authorName: z.string().trim().min(2, 'Подпишитесь, чтобы вас узнали').max(80),
  /** step id -> answers, only contributor steps are accepted */
  answers: Answers,
});
export type ContributionRequest = z.infer<typeof ContributionRequest>;

export const PaymentKind = z.enum(['deposit', 'balance']);
export type PaymentKind = z.infer<typeof PaymentKind>;

export const CheckoutRequest = z.object({
  kind: PaymentKind,
});
export type CheckoutRequest = z.infer<typeof CheckoutRequest>;

export const CheckoutResponse = z.object({
  paymentId: z.string(),
  redirectUrl: z.string(),
});
export type CheckoutResponse = z.infer<typeof CheckoutResponse>;

export const ChangeStatusRequest = z.object({
  to: ProjectStatus,
  note: z.string().trim().max(500).optional(),
});
export type ChangeStatusRequest = z.infer<typeof ChangeStatusRequest>;

// ---------- Responses ----------

export const Contribution = z.object({
  id: z.string(),
  authorName: z.string(),
  answers: Answers,
  createdAt: z.iso.datetime(),
});
export type Contribution = z.infer<typeof Contribution>;

export const StatusChange = z.object({
  from: ProjectStatus.nullable(),
  to: ProjectStatus,
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type StatusChange = z.infer<typeof StatusChange>;

export const CreateProjectResponse = z.object({
  id: z.string(),
  editKey: z.string(),
  inviteKey: z.string(),
});
export type CreateProjectResponse = z.infer<typeof CreateProjectResponse>;

/** Full project view for its owner (accessed by secret edit key). */
export const ProjectView = z.object({
  id: z.string(),
  productId: ProductId,
  subject: z.string(),
  status: ProjectStatus,
  quote: Quote,
  customer: Customer,
  answers: Answers,
  contributions: z.array(Contribution),
  draft: Draft.nullable(),
  /** Latest layout version, if one was made. */
  layout: LayoutView.nullable(),
  design: DesignState,
  /** The customer may take the questionnaire back once after the submit, until the layout is approved. */
  canReopen: z.boolean().default(false),
  inviteKey: z.string(),
  paidAmount: z.number().int().nonnegative(),
  history: z.array(StatusChange),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ProjectView = z.infer<typeof ProjectView>;

/** What an invited contributor may see (no contacts, no prices, no other people's answers). */
export const InviteView = z.object({
  productId: ProductId,
  subject: z.string(),
  ownerName: z.string(),
  acceptingContributions: z.boolean(),
  contributionsCount: z.number().int().nonnegative(),
});
export type InviteView = z.infer<typeof InviteView>;

/**
 * The online version of a finished issue, behind the QR code on its back cover. Reached by the
 * invite link (friends who contributed see the result too); pages appear once the customer has
 * approved the layout and paid for printing.
 */
export const IssueView = z.object({
  productId: ProductId,
  subject: z.string(),
  ready: z.boolean(),
  /** Pages of the approved layout (empty until ready). */
  pages: z.array(LayoutPage),
  acceptingContributions: z.boolean(),
});
export type IssueView = z.infer<typeof IssueView>;

/** Row in the studio back-office list. */
export const ProjectListItem = z.object({
  id: z.string(),
  productId: ProductId,
  subject: z.string(),
  status: ProjectStatus,
  customerName: z.string(),
  customerPhone: z.string(),
  total: z.number().int(),
  paidAmount: z.number().int(),
  contributionsCount: z.number().int(),
  designMode: DesignMode,
  /** Gift date from the questionnaire (see DateField.role), the production deadline. */
  deadline: z.iso.date().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ProjectListItem = z.infer<typeof ProjectListItem>;

export const ProjectList = z.object({
  items: z.array(ProjectListItem),
});
export type ProjectList = z.infer<typeof ProjectList>;

/** Internal note of the studio on a project; customers never see it. */
export const ProjectNote = z.object({
  id: z.string(),
  text: z.string(),
  author: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type ProjectNote = z.infer<typeof ProjectNote>;

/** Studio view: owner view plus edit key so the team can open the customer's workspace. */
export const AdminProjectView = ProjectView.extend({
  editKey: z.string(),
  /** Every layout version, newest first. */
  layouts: z.array(LayoutView),
  deadline: z.iso.date().nullable(),
  /** Internal notes of the studio, newest first. */
  notes: z.array(ProjectNote),
});
export type AdminProjectView = z.infer<typeof AdminProjectView>;

// ---------- Internal (service to service) ----------

/**
 * Everything the layout service needs to typeset a project: `GET /internal/projects/:id/layout-source`.
 * Materials are frozen once the project is in design, so this is a stable snapshot.
 */
export const LayoutSource = z.object({
  projectId: z.string(),
  productId: ProductId,
  subject: z.string(),
  formatId: z.string(),
  status: ProjectStatus,
  designMode: DesignMode,
  /** Version number the next generated layout gets. */
  nextVersion: z.number().int().positive(),
  answers: Answers,
  contributions: z.array(Contribution),
  /** Public online issue (IssueView), printed as a QR code on the back cover. */
  issueUrl: z.url().optional(),
});
export type LayoutSource = z.infer<typeof LayoutSource>;

/**
 * `POST /internal/preview` of the layout service: renders a PDF from given materials without
 * storing or publishing anything. For tuning templates and support.
 */
export const LayoutPreviewRequest = z.object({
  source: LayoutSource.omit({ status: true, designMode: true, nextVersion: true }),
  draft: DraftContent,
  generator: z.string().default('preview'),
});
export type LayoutPreviewRequest = z.infer<typeof LayoutPreviewRequest>;

/** projects → layout: page previews of the current answers (nothing stored as a layout, no events). */
export const LayoutPreviewPagesRequest = z.object({
  source: LayoutSource,
  draft: DraftContent,
});
export type LayoutPreviewPagesRequest = z.infer<typeof LayoutPreviewPagesRequest>;
