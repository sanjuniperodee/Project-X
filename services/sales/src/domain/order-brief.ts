import { formatTenge, isStepComplete, ownerSteps, PROJECT_STATUS_LABELS, type Product, type ProjectView } from '@px/contracts';

/**
 * What the AI seller knows about one order, in plain words: where it is, what the customer does next and where on
 * the site, what is filled in and what is missing. Built fresh on every turn, so the bot answers while the customer
 * fills the questionnaire and sees their latest answers.
 */
export function orderBrief(p: ProjectView, product: Product, links: { workspaceUrl: string; inviteUrl: string }): string {
  const lines: string[] = [];
  const due = p.quote.total - p.paidAmount;
  const format = product.formats.find((f) => f.id === p.quote.formatId);
  lines.push(
    `### Заказ projectId=${p.id}: ${product.name} «${p.subject}»${format ? `, формат «${format.name}»` : ''}`,
    `Статус: «${PROJECT_STATUS_LABELS[p.status]}». Итого ${formatTenge(p.quote.total)}, оплачено ${formatTenge(p.paidAmount)}${due > 0 ? `, осталось ${formatTenge(due)}` : ''}.`,
    `Что сейчас и следующий шаг клиента: ${nextStep(p, product)}`,
  );

  const steps = ownerSteps(product);
  if (p.status === 'draft' || p.status === 'deposit_paid') {
    const done = steps.filter((s) => isStepComplete(s, p.answers[s.id]));
    const empty = steps.filter((s) => !hasAnything(p.answers[s.id]));
    const partial = steps.filter((s) => hasAnything(p.answers[s.id]) && !isStepComplete(s, p.answers[s.id]));
    lines.push(`Анкета: готово ${done.length} из ${steps.length} разделов.`);
    if (partial.length) lines.push(`Начаты, но не дозаполнены: ${partial.map((s) => `«${s.title}»`).join(', ')}.`);
    if (empty.length) lines.push(`Пустые: ${empty.map((s) => `«${s.title}»`).join(', ')}.`);
    lines.push(`Фото загружено: ${countPhotos(p.answers)}.`);
  }
  if (product.collaboration.enabled) {
    lines.push(
      `Истории от ${product.collaboration.contributorNoun}: ${p.contributions.length}${p.contributions.length ? ` (${p.contributions.map((c) => c.authorName).slice(0, 8).join(', ')})` : ''}.`,
    );
  }
  if (p.layout) {
    const left = Math.max(0, p.design.revisionsLimit - p.design.revisionsUsed);
    lines.push(
      `Макет: версия ${p.layout.version}, ${LAYOUT_STATUS[p.layout.status] ?? p.layout.status}, ${p.layout.pages.length} стр.; осталось кругов автоматических правок: ${left}${p.design.mode === 'studio' ? '; макетом занимается дизайнер студии вручную' : ''}.`,
    );
    if (p.layout.feedback) lines.push(`Последние правки клиента: «${p.layout.feedback.slice(0, 300)}».`);
  }
  lines.push(`Ссылки (давай их, когда клиенту нужно куда-то перейти): кабинет ${links.workspaceUrl}; приглашение для друзей ${links.inviteUrl}.`);
  return lines.join('\n');
}

const LAYOUT_STATUS: Record<string, string> = {
  pending: 'ждёт решения клиента',
  approved: 'согласован',
  changes_requested: 'клиент попросил правки — готовим новую версию',
  discarded: 'отложен — заказом занимается студия',
};

function nextStep(p: ProjectView, product: Product): string {
  switch (p.status) {
    case 'draft':
      return 'ждём предоплату. Счёт Kaspi выставляешь ты (send_payment_invoice deposit) или клиент жмёт «Оплатить» в кабинете. Сразу после предоплаты в кабинете откроется анкета для отправки и превью страниц.';
    case 'deposit_paid':
      return `клиент собирает материалы: заполняет анкету в кабинете (сохраняется сама), загружает фото, рассылает друзьям приглашение. В кабинете видно превью ${product.id === 'boardgame' ? 'игры' : 'номера'} из его ответов. Можно рассказать всё голосом — кнопка «Открыть голосовую студию». Когда готово — кнопка отправки внизу анкеты; после неё анкету менять нельзя.`;
    case 'in_design':
      return 'материалы в работе: ИИ пишет тексты и верстает макет, обычно несколько минут (если макетом занимается дизайнер — до пары дней). Ничего делать не нужно — пришлём уведомление, когда макет будет готов.';
    case 'awaiting_approval':
      return 'макет готов и ждёт решения в кабинете: листать развороты, скачать PDF, нажать «Согласовать» или «Нужны правки» с комментарием. После согласования — счёт на остаток.';
    case 'paid':
      return 'оплачено полностью, готовим к печати.';
    case 'printing':
      return `печатается (обычно ${product.productionDays} дн.).`;
    case 'shipped':
      return 'отправлен клиенту.';
    case 'delivered':
      return 'доставлен. Можно попросить отзыв и фото подарка.';
    case 'cancelled':
      return 'заказ отменён.';
  }
}

const hasAnything = (v: unknown): boolean =>
  v != null && v !== '' && (Array.isArray(v) ? v.some(hasAnything) : typeof v === 'object' ? Object.values(v as object).some(hasAnything) : true);

function countPhotos(answers: unknown): number {
  let n = 0;
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.url === 'string' && typeof o.id === 'string') n++;
      else Object.values(o).forEach(walk);
    }
  };
  walk(answers);
  return n;
}
