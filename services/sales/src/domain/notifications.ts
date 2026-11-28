import { formatTenge, type ProjectStatus } from '@px/contracts';

export interface NotificationContext {
  productName: string;
  subject: string;
  customerName: string;
  workspaceUrl: string;
  inviteUrl: string;
  /** Left to pay now (balance after the layout is approved). */
  balance: number;
  productionDays: number;
}

/**
 * WhatsApp message to the customer when the order moves on. null: nothing worth a message
 * (statuses the customer caused themselves seconds ago are still confirmed: people like a receipt).
 */
export function statusMessage(to: ProjectStatus, c: NotificationContext, from: string | null = null): string | null {
  const hi = `${c.customerName.split(' ')[0] || 'Здравствуйте'}, `;
  switch (to) {
    case 'deposit_paid':
      if (from === 'in_design' || from === 'awaiting_approval') {
        return `${hi}анкета снова открыта — меняйте ответы и фото здесь: ${c.workspaceUrl}\nКогда будет готово, отправьте её ещё раз: соберём новый макет. Вернуть анкету можно было один раз, так что в этот раз проверьте превью перед отправкой.`;
      }
      return (
        `${hi}предоплата за «${c.productName}» про ${c.subject} получена, спасибо!\n\n` +
        `Дальше анкета и истории друзей — заполняйте здесь: ${c.workspaceUrl}\n` +
        `Ссылка для друзей и родных (пусть добавят свои истории и фото): ${c.inviteUrl}\n\n` +
        'В кабинете сразу видно превью страниц из ваших ответов. Когда всё готово — кнопка отправки внизу анкеты.'
      );
    case 'in_design':
      return `${hi}материалы получили — начинаем делать макет «${c.productName}». Напишем, как только он будет готов.`;
    case 'awaiting_approval':
      return (
        `${hi}макет «${c.productName}» готов! Посмотрите и согласуйте: ${c.workspaceUrl}\n` +
        (c.balance > 0 ? `После согласования останется оплатить ${formatTenge(c.balance)} — и отправляем в печать.` : '')
      ).trim();
    case 'paid':
      return `${hi}оплата получена, заказ уходит в печать. Обычно это ${c.productionDays} дн. — сообщим, когда отправим.`;
    case 'printing':
      return `${hi}«${c.productName}» печатается.`;
    case 'shipped':
      return `${hi}заказ отправлен! Детали доставки: ${c.workspaceUrl}`;
    case 'delivered':
      return `${hi}заказ доставлен. Будем рады отзыву — и фото подарка в руках 🙂`;
    case 'cancelled':
      return `${hi}заказ «${c.productName}» отменён. Если это ошибка — просто ответьте на это сообщение.`;
    case 'draft':
      return null;
  }
}
