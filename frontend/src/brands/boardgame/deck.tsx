'use client';

import { useState } from 'react';
import { cn } from '@/shared/lib/cn';

interface Card {
  kind: string;
  text: string;
  className: string;
}

const CARDS: Card[] = [
  { kind: 'Конфликт', text: 'Чей плов лучше: мамин или тётин? Голосуют все, воздержаться нельзя.', className: 'bg-game-tomato text-white' },
  { kind: 'Вопрос', text: 'В каком году Дана впервые сказала «с понедельника на диете»?', className: 'bg-game-cobalt text-white' },
  { kind: 'Шанс', text: 'Асхат снова забыл пароль от Wi-Fi. Все отступают на одну клетку.', className: 'bg-game-mint text-black' },
  { kind: 'Задание', text: 'Изобрази начальника на планёрке. У тебя 30 секунд.', className: 'bg-white text-black' },
  { kind: 'Кто из нас', text: 'Кто первым уйдёт с вечеринки и сделает вид, что никуда не уходил?', className: 'bg-game-yellow text-black' },
];

const FAN = [
  'rotate-[-14deg] -translate-x-[38%] translate-y-[6%]',
  'rotate-[-6deg] -translate-x-[18%]',
  'rotate-[2deg] translate-x-0 -translate-y-[2%]',
  'rotate-[9deg] translate-x-[18%]',
  'rotate-[16deg] translate-x-[36%] translate-y-[7%]',
];

/** The hero's memorable moment: a fanned deck that reshuffles on click. */
export function Deck() {
  const [order, setOrder] = useState(() => CARDS.map((_, i) => i));

  // Deals the top card to the bottom of the deck, so every click reveals a new card.
  const shuffle = () => setOrder((current) => [current[current.length - 1]!, ...current.slice(0, -1)]);

  return (
    <div className="flex flex-col items-center gap-14">
      <div className="relative h-[300px] w-[200px] sm:h-[400px] sm:w-[270px]">
        {order.map((cardIndex, position) => {
          const card = CARDS[cardIndex]!;
          const isTop = position === order.length - 1;
          return (
            <div
              key={cardIndex}
              aria-hidden={!isTop}
              className={cn(
                'absolute inset-0 flex flex-col justify-between rounded-[22px] border-[3px] border-black p-4 shadow-[6px_6px_0_#000] transition-transform duration-500 ease-[cubic-bezier(0.3,1.4,0.5,1)] sm:p-6',
                card.className,
                FAN[position],
              )}
              style={{ zIndex: position }}
            >
              <span className="self-start rounded-full border-2 border-current px-3 py-1 text-sm font-semibold">{card.kind}</span>
              <p className="font-display text-[16px] leading-[1.25] font-bold sm:text-[22px]">{card.text}</p>
              <span className="self-end font-display text-sm font-black">MyGame</span>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={shuffle}
        className="rounded-full border-[3px] border-black bg-white px-5 py-2.5 font-display text-sm font-bold shadow-[4px_4px_0_#000] transition-transform active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
      >
        Перемешать колоду
      </button>
      <p className="sr-only" aria-live="polite">
        Верхняя карта: {CARDS[order[order.length - 1]!]!.kind}. {CARDS[order[order.length - 1]!]!.text}
      </p>
    </div>
  );
}
