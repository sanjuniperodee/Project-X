import { formatTenge, type ProductFormat } from '@px/contracts';
import { Faq } from '../_shared/faq';
import type { LandingProps } from '../types';
import { ButtonLink } from '@/shared/ui/button';
import { Container } from '@/shared/ui/container';
import { SITE } from '@/shared/config/site';
import { cn } from '@/shared/lib/cn';
import { Deck } from './deck';

const BOX_COLORS = ['bg-game-tomato text-white', 'bg-game-cobalt text-white', 'bg-game-mint text-black'];
/** A big glyph on each box lid hints at the game inside. */
const BOX_GLYPHS = ['!?', '?', '₸'];

const CHAT = [
  { from: 'Аружан', text: 'Добавила историю, как Тимур уснул на тимбилдинге 😂', mine: false },
  { from: 'Тимур', text: 'Тогда я добавлю вопрос про твой «пятиминутный» созвон', mine: false },
  { from: 'Вы', text: 'Уже 46 карточек! В пятницу отправляю дизайнеру', mine: true },
];

export function BoardgameLanding({ product, href }: LandingProps) {
  const priceFrom = Math.min(...product.formats.map((f) => f.price));
  const faq = [
    {
      q: 'Сколько людей нужно для игры?',
      a: 'От трёх. Викторина и «Карты конфликта» хорошо работают и в компании из 20 человек: играют командами.',
    },
    {
      q: 'Что если у нас мало историй?',
      a: 'Достаточно имён игроков и десятка фактов. Остальные карточки допишем по шаблону под вашу компанию, а вы отберёте лучшие.',
    },
    {
      q: 'Можно без шуток 18+?',
      a: 'Да, градус выбираете вы: игра для всей семьи, с подколками или только для взрослых.',
    },
    {
      q: 'Когда будет готово?',
      a: `Через ${product.productionDays} дней после согласования макета. Макет показываем в PDF: каждую карточку можно поправить.`,
    },
  ];

  return (
    <>
      <section className="overflow-x-clip border-b-[3px] border-black bg-game-yellow">
        <Container wide className="grid items-center gap-14 py-12 lg:grid-cols-[1.15fr_1fr] lg:py-20">
          <div>
            <h1 className="font-display text-[clamp(2.6rem,6vw,5.6rem)] leading-[1.02] font-black tracking-[-0.02em]">
              Настолка про вашу компанию
            </h1>
            <p className="mt-6 max-w-[46ch] text-lg leading-relaxed">
              Викторина, карты конфликта или своя экономическая игра. Вы кидаете ссылку в чат, друзья добавляют мемы и
              истории, а мы собираем колоду, поле и коробку.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <ButtonLink href={href('/create')} size="lg" className="bg-white!">
                Собрать игру
              </ButtonLink>
              <p className="font-medium">от {formatTenge(priceFrom)}</p>
            </div>
          </div>
          <Deck />
        </Container>
      </section>

      <section id="games" className="border-b-[3px] border-black">
        <Container wide className="py-16 lg:py-24">
          <h2 className="font-display text-4xl leading-tight font-black lg:text-5xl">Три игры на выбор</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {product.formats.map((format, i) => (
              <GameBox key={format.id} format={format} color={BOX_COLORS[i % BOX_COLORS.length]!} glyph={BOX_GLYPHS[i % BOX_GLYPHS.length]!} />
            ))}
          </div>
          <p className="mt-10 text-muted">Сначала предоплата {formatTenge(product.deposit)}, остальное после согласования макета.</p>
        </Container>
      </section>

      <section className="border-b-[3px] border-black bg-game-mint">
        <Container wide className="grid items-center gap-12 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <h2 className="font-display text-4xl leading-tight font-black lg:text-5xl">Собираете всем чатом</h2>
            <ol className="mt-8 space-y-5">
              {[
                'Создаёте игру и вписываете игроков.',
                'Кидаете ссылку в WhatsApp. Каждый добавляет свои истории и мемные фото.',
                'Мы превращаем это в карточки, поле и правила, а вы утверждаете макет.',
              ].map((text, i) => (
                <li key={text} className="flex gap-4 text-lg leading-relaxed">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-[3px] border-black bg-white font-display text-sm font-black">
                    {i + 1}
                  </span>
                  {text}
                </li>
              ))}
            </ol>
          </div>
          <div className="mx-auto w-full max-w-md rounded-[28px] border-[3px] border-black bg-[#efe7dc] p-4 shadow-[8px_8px_0_#000] sm:p-6">
            <p className="mb-4 text-center text-sm font-medium text-black/60">Чат «Отдел продаж 🦈»</p>
            <div className="flex flex-col gap-3">
              {CHAT.map((m) => (
                <div
                  key={m.text}
                  className={cn(
                    'max-w-[85%] rounded-2xl border-2 border-black px-4 py-2.5',
                    m.mine ? 'self-end bg-[#d9fdd3]' : 'self-start bg-white',
                  )}
                >
                  {!m.mine && <p className="text-sm font-semibold text-game-cobalt">{m.from}</p>}
                  <p className="leading-snug">{m.text}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {product.b2b && (
        <section className="border-b-[3px] border-black bg-game-cobalt text-white">
          <Container wide className="grid gap-8 py-16 lg:grid-cols-[1fr_auto] lg:items-end lg:py-20">
            <div>
              <h2 className="font-display text-4xl leading-tight font-black lg:text-5xl">Для компаний</h2>
              <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-white/85">{product.b2b.description}</p>
              <p className="mt-4 font-display text-2xl font-bold">от {formatTenge(product.b2b.priceFrom)} за тираж</p>
            </div>
            <ButtonLink
              href={`https://wa.me/${SITE.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent('Здравствуйте! Хотим обсудить тираж настольной игры для компании.')}`}
              size="lg"
              className="bg-game-yellow!"
            >
              Обсудить тираж в WhatsApp
            </ButtonLink>
          </Container>
        </section>
      )}

      <section>
        <Container wide className="grid gap-10 py-16 lg:grid-cols-[0.7fr_1fr] lg:py-24">
          <h2 className="font-display text-4xl leading-tight font-black lg:text-5xl">Вопросы</h2>
          <Faq items={faq} />
        </Container>
      </section>

      <section className="border-t-[3px] border-black bg-game-tomato text-white">
        <Container wide className="flex flex-col items-start gap-8 py-16 lg:py-20">
          <p className="max-w-[18ch] font-display text-[clamp(2.2rem,5vw,4.2rem)] leading-[1.05] font-black">
            Следующая пятница может быть игровой
          </p>
          <ButtonLink href={href('/create')} size="lg" className="bg-white!">
            Собрать игру
          </ButtonLink>
        </Container>
      </section>
    </>
  );
}

function GameBox({ format, color, glyph }: { format: ProductFormat; color: string; glyph: string }) {
  return (
    <article className="flex flex-col">
      <div
        aria-hidden
        className={cn(
          'relative flex aspect-[4/3] items-end rounded-[20px] border-[3px] border-black p-5 shadow-[8px_8px_0_#000]',
          color,
        )}
      >
        <span className="absolute top-3 right-5 font-display text-[88px] leading-none font-black opacity-90">{glyph}</span>
        <p className="font-display text-2xl leading-tight font-black">{format.name}</p>
        {format.recommended && (
          <span className="absolute -top-4 right-4 rotate-6 rounded-full border-[3px] border-black bg-game-yellow px-3 py-1 font-display text-xs font-bold text-black">
            Хит
          </span>
        )}
      </div>
      <p className="mt-6 leading-relaxed">{format.description}</p>
      <ul className="mt-4 space-y-1.5 text-muted">
        {format.specs.map((spec) => (
          <li key={spec}>— {spec}</li>
        ))}
      </ul>
      <p className="mt-5 font-display text-2xl font-black">{formatTenge(format.price)}</p>
    </article>
  );
}
