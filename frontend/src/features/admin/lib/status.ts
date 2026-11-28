import type { ProjectStatus } from '@px/contracts';

/**
 * Status wording for the studio. Shorter and more operational than the customer-facing
 * labels in the contracts: it says what the team has to do or wait for.
 */
export const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Без предоплаты',
  deposit_paid: 'Сбор материалов',
  in_design: 'Вёрстка',
  awaiting_approval: 'На согласовании',
  paid: 'Оплачен, к печати',
  printing: 'В печати',
  shipped: 'Доставка',
  delivered: 'Вручён',
  cancelled: 'Отменён',
};

export type StatusTone = 'neutral' | 'progress' | 'waiting' | 'done' | 'stopped';

/** Colour groups: the team is waiting for money, working, waiting for the customer, finishing, stopped. */
export const STATUS_TONE: Record<ProjectStatus, StatusTone> = {
  draft: 'neutral',
  deposit_paid: 'progress',
  in_design: 'progress',
  awaiting_approval: 'waiting',
  paid: 'done',
  printing: 'done',
  shipped: 'done',
  delivered: 'done',
  cancelled: 'stopped',
};

export const TONE_DOT: Record<StatusTone, string> = {
  neutral: 'bg-zinc-400',
  progress: 'bg-amber-500',
  waiting: 'bg-blue-600',
  done: 'bg-emerald-600',
  stopped: 'bg-red-600',
};

export const TONE_PILL: Record<StatusTone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700',
  progress: 'bg-amber-50 text-amber-900',
  waiting: 'bg-blue-50 text-blue-800',
  done: 'bg-emerald-50 text-emerald-800',
  stopped: 'bg-red-50 text-red-700',
};

/** The order's road, for the stepper of the order page. */
export const PIPELINE: ProjectStatus[] = ['draft', 'deposit_paid', 'in_design', 'awaiting_approval', 'paid', 'printing', 'shipped', 'delivered'];

/** Columns of the board, in the order work flows. */
export const BOARD_STATUSES: ProjectStatus[] = ['draft', 'deposit_paid', 'in_design', 'awaiting_approval', 'paid', 'printing', 'shipped'];
