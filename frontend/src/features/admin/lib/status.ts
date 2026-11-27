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

/** Columns of the board, in the order work flows. */
export const BOARD_STATUSES: ProjectStatus[] = ['draft', 'deposit_paid', 'in_design', 'awaiting_approval', 'paid', 'printing', 'shipped'];
