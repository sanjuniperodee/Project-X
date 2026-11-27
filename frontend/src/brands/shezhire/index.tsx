import type { BrandDefinition } from '../types';
import { cn } from '@/shared/lib/cn';
import { ShezhireLanding } from './landing';
import { OrnamentMark } from './ornament';

function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <OrnamentMark className="h-5 text-shezhire-gold" />
      <span className="font-display text-[28px] leading-none font-semibold">Шежіре</span>
    </span>
  );
}

export const shezhireBrand: BrandDefinition = {
  id: 'shezhire',
  name: 'Шежіре',
  metadata: {
    title: 'Шежіре — книга рода и семейное древо',
    description:
      'Соберите шежіре всей семьёй: древо до семи поколений, реставрация старых фото, книга рода и интерьерный постер с древом.',
  },
  Logo,
  Landing: ShezhireLanding,
  chrome: { header: 'bg-shezhire-indigo text-shezhire-paper', footer: 'bg-shezhire-night text-shezhire-paper/80' },
  cta: 'Начать шежіре',
  copy: {
    subjectLabel: 'Чей это род',
    subjectPlaceholder: 'Семья Сейткалиевых',
    subjectHint: 'Так будет называться проект. Название книги уточним позже.',
    createTitle: 'Новое шежіре',
    createLead: 'Выберите, что хотите получить, и оставьте контакты. Потом откроется древо — его можно заполнять неделями, вместе с родными.',
    workspaceTitle: (subject) => `Шежіре: ${subject}`,
    submitLabel: 'Передать материалы в работу',
    submitHint: 'После передачи мы начнём реставрацию и вёрстку книги. Новые воспоминания родных можно будет прислать через менеджера.',
    inviteMessage: (subject, link) =>
      `Собираем шежіре нашей семьи (${subject}). Добавьте, пожалуйста, что помните о старших и фото из своего альбома: ${link}`,
    draftCardsTitle: 'Родные',
    contributionThanks: 'Рахмет! Ваши воспоминания войдут в книгу рода.',
  },
};
