import type { DesignMode, LayoutPage, LayoutStatus } from '@px/contracts';
import { ProjectRuleViolation, transition, type Project, type StatusChange } from './project';

/**
 * Layout versions of a project and the customer's decisions on them. Pure rules, no I/O.
 *
 *   in_design ──layout.generated──▶ awaiting_approval ──approve──▶ (customer pays the balance) ──▶ paid
 *       ▲                                   │
 *       └──────── request changes ──────────┘  up to `revisionsLimit` times automatically,
 *                                              then the project goes to a person in the studio.
 */
export interface Layout {
  projectId: string;
  version: number;
  status: LayoutStatus;
  pdfUrl: string;
  pages: LayoutPage[];
  template: string;
  warnings: string[];
  feedback: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

export interface GeneratedLayout {
  version: number;
  pdfUrl: string;
  pages: LayoutPage[];
  template: string;
  warnings: string[];
}

/** Records a generated layout. Shows it to the customer only if the project is waiting for it. */
export function acceptLayout(project: Project, generated: GeneratedLayout, now = new Date()): { layout: Layout; change: StatusChange | null } {
  const waiting = project.status === 'in_design' && project.designMode === 'auto';
  const layout: Layout = {
    projectId: project.id,
    ...generated,
    status: waiting ? 'pending' : 'discarded',
    feedback: null,
    createdAt: now,
    decidedAt: null,
  };
  const change = waiting ? transition(project, 'awaiting_approval', `Макет готов, версия ${generated.version}`) : null;
  return { layout, change };
}

function assertDecidable(project: Project, layout: Layout | null, version: number): asserts layout is Layout {
  if (project.status !== 'awaiting_approval' || !layout || layout.status !== 'pending') {
    throw new ProjectRuleViolation('no_layout_to_decide', 'Сейчас нет макета, который ждёт вашего решения');
  }
  if (layout.version !== version) {
    throw new ProjectRuleViolation('stale_layout', 'Макет уже обновился — обновите страницу и посмотрите новую версию');
  }
}

/** The customer approves the layout; the balance payment opens next. */
export function approveLayout(project: Project, layout: Layout | null, version: number, now = new Date()): void {
  assertDecidable(project, layout, version);
  layout.status = 'approved';
  layout.decidedAt = now;
  project.updatedAt = now;
}

export interface ChangesOutcome {
  change: StatusChange;
  /** 'auto': regenerate the draft and layout; 'studio': a person takes over. */
  next: DesignMode;
  /** Number of the automatic revision round started (when next is 'auto'). */
  revision: number | null;
}

/**
 * The customer asks for changes. Within the limit the AI rewrites the draft and the layout is rebuilt;
 * past it — or when no automatic layout is on the table — a designer in the studio takes over.
 */
export function requestLayoutChanges(
  project: Project,
  layout: Layout | null,
  version: number | null,
  comment: string,
  revisionsLimit: number,
  now = new Date(),
): ChangesOutcome {
  if (project.status !== 'awaiting_approval') {
    throw new ProjectRuleViolation('no_layout_to_decide', 'Сейчас нет макета, который ждёт вашего решения');
  }
  const onAutomaticLayout = layout?.status === 'pending';
  if (layout && onAutomaticLayout) {
    if (version !== layout.version) {
      throw new ProjectRuleViolation('stale_layout', 'Макет уже обновился — обновите страницу и посмотрите новую версию');
    }
    layout.status = 'changes_requested';
    layout.feedback = comment;
    layout.decidedAt = now;
  }

  const automatic = project.designMode === 'auto' && onAutomaticLayout;
  const withinLimit = project.revisionsUsed < revisionsLimit;
  let next: DesignMode;
  let note: string;
  if (automatic && withinLimit) {
    project.revisionsUsed += 1;
    next = 'auto';
    note = `Нужны правки (круг ${project.revisionsUsed} из ${revisionsLimit}): ${comment}`;
  } else {
    project.designMode = 'studio';
    next = 'studio';
    note = automatic
      ? `Нужны правки: ${comment}. Лимит автоматических правок исчерпан — макет доработает дизайнер`
      : `Нужны правки: ${comment}`;
  }
  const change = transition(project, 'in_design', note.slice(0, 1000));
  return { change, next, revision: next === 'auto' ? project.revisionsUsed : null };
}

/** The layout pipeline gave up: the studio takes over. Returns false if a person already had it. */
export function handOverToStudio(project: Project): boolean {
  if (project.designMode === 'studio' || project.status !== 'in_design') return false;
  project.designMode = 'studio';
  project.updatedAt = new Date();
  return true;
}

/** The balance can be paid once the current automatic layout is approved. */
export function assertLayoutApproved(layout: Layout | null): void {
  if (layout?.status === 'pending') {
    throw new ProjectRuleViolation('nothing_to_pay', 'Сначала согласуйте макет — оплата остатка откроется сразу после');
  }
}
