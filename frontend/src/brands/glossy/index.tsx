import type { BrandDefinition } from '../types';
import { cn } from '@/shared/lib/cn';
import { GlossyLanding } from './landing';
import { GlossyVoicePreview } from './voice-preview';

function Logo({ className }: { className?: string }) {
  return <span className={cn('font-display text-[26px] leading-none font-black tracking-[-0.04em]', className)}>COVER ME</span>;
}

export const glossyBrand: BrandDefinition = {
  id: 'glossy',
  name: 'Cover Me',
  metadata: {
    title: 'Cover Me — персональный глянцевый журнал в подарок',
    description:
      'Глянцевый журнал на 24–36 страниц о вашем человеке: интервью, правила жизни, фотосессия и истории от друзей. Подарок на день рождения и юбилей.',
  },
  Logo,
  Landing: GlossyLanding,
  VoicePreview: GlossyVoicePreview,
  chrome: { header: 'border-b-2 border-black bg-white', footer: 'border-t-2 border-black bg-white' },
  cta: 'Собрать журнал',
  copy: {
    subjectLabel: 'Кто будет героем номера',
    subjectPlaceholder: 'Айгерим',
    subjectHint: 'Имя, пара или компания. Поменять можно позже.',
    createTitle: 'Новый номер',
    createLead: 'Выберите формат и оставьте контакты. Дальше откроется анкета — её можно заполнять частями.',
    workspaceTitle: (subject) => `Номер про ${subject}`,
    submitLabel: 'Отправить в редакцию',
    submitHint: 'После отправки анкету нельзя будет менять: редактор начнёт работу над текстами.',
    inviteMessage: (subject, link) =>
      `Делаем журнал про ${subject} 🤫 Напишите историю или пожелание, это 5 минут. Только не проговоритесь! ${link}`,
    draftCardsTitle: 'Выносы на обложку',
    contributionThanks: 'Ваша история уже у редактора. Обещаем никому не говорить до выхода номера.',
  },
};
