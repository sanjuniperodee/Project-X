import type { BrandDefinition } from '../types';
import { cn } from '@/shared/lib/cn';
import { BoardgameLanding } from './landing';

function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect x="2" y="2" width="24" height="24" rx="6" fill="var(--color-game-tomato)" stroke="#000" strokeWidth="2.5" />
        <circle cx="9" cy="9" r="2.2" fill="#000" />
        <circle cx="14" cy="14" r="2.2" fill="#000" />
        <circle cx="19" cy="19" r="2.2" fill="#000" />
      </svg>
      <span className="font-display text-[22px] leading-none font-black tracking-[-0.02em]">MyGame</span>
    </span>
  );
}

export const boardgameBrand: BrandDefinition = {
  id: 'boardgame',
  name: 'MyGame',
  metadata: {
    title: 'MyGame — настольная игра про вашу компанию',
    description:
      'Викторина, карты конфликта или экономическая игра про друзей, семью или офис. Собираете мемы всем чатом — мы печатаем коробку.',
  },
  Logo,
  Landing: BoardgameLanding,
  chrome: { header: 'border-b-[3px] border-black bg-white', footer: 'border-t-[3px] border-black bg-game-yellow' },
  cta: 'Собрать игру',
  copy: {
    subjectLabel: 'Про кого игра',
    subjectPlaceholder: 'Отдел продаж «Акулы»',
    subjectHint: 'Компания друзей, семья или команда.',
    createTitle: 'Новая игра',
    createLead: 'Выберите игру и оставьте контакты. Дальше вы впишете игроков и кинете ссылку в чат, чтобы все добавили мемы.',
    workspaceTitle: (subject) => `Игра: ${subject}`,
    submitLabel: 'Отправить в производство',
    submitHint: 'После отправки мы соберём колоду и поле. Новые мемы из чата можно будет добавить на этапе макета.',
    inviteMessage: (subject, link) =>
      `Делаем настолку про нас (${subject}) 🎲 Закиньте свою историю, вопрос или мем — лучшие попадут в колоду: ${link}`,
    draftCardsTitle: 'Карточки колоды',
    contributionThanks: 'Есть! Ваша карточка в колоде. Посмотрим, кто её вытянет первым.',
  },
};
