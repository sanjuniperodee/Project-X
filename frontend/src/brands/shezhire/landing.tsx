import { formatTenge } from '@px/contracts';
import { Faq } from '../_shared/faq';
import type { LandingProps } from '../types';
import { ButtonLink } from '@/shared/ui/button';
import { Container } from '@/shared/ui/container';
import { cn } from '@/shared/lib/cn';
import { GrowingTree } from './growing-tree';
import { OrnamentBand, OrnamentMark } from './ornament';
import { Restoration } from './restoration';

const STEPS = [
  { title: 'Вы начинаете древо', text: 'Вписываете тех, кого знаете: себя, родителей, бабушек и дедушек. Даже имени достаточно.' },
  { title: 'Подключаются родные', text: 'Ссылку отправляете в семейный чат. Тёти, дяди и двоюродные добавляют воспоминания и фото из своих альбомов.' },
  { title: 'Мы собираем летопись', text: 'Реставрируем снимки, сверяем поколения и пишем главы о каждой ветви семьи.' },
  { title: 'Книга приезжает домой', text: 'Вы согласуете макет, а мы печатаем книгу и древо в раме.' },
];

export function ShezhireLanding({ product, href }: LandingProps) {
  const bilingual = product.extras.find((e) => e.id === 'bilingual');
  const extraBook = product.extras.find((e) => e.id === 'extra-book');
  const priceFrom = Math.min(...product.formats.map((f) => f.price));

  const faq = [
    {
      q: 'Мы помним только три поколения. Этого хватит?',
      a: 'Да. Начните с тех, кого знаете. Обычно после рассылки по семейному чату древо вырастает до пяти–шести поколений: у кого-то из старших всегда хранится тетрадь или альбом.',
    },
    ...(bilingual
      ? [
          {
            q: 'Можно сделать книгу на казахском?',
            a: `Можно на казахском, на русском или на двух языках параллельно. Перевод стоит ${formatTenge(bilingual.unitPrice)}.`,
          },
        ]
      : []),
    {
      q: 'Как отправить старые фото, если они в альбоме?',
      a: 'Сфотографируйте их телефоном у окна, без вспышки. Этого достаточно для реставрации. Оригиналы остаются у вас.',
    },
    {
      q: 'Сколько времени занимает работа?',
      a: `Сбор материалов идёт в вашем темпе. После согласования макета печать и доставка занимают около ${product.productionDays} дней.`,
    },
    ...(extraBook
      ? [
          {
            q: 'Нужны книги для каждой ветви семьи',
            a: `Дополнительный экземпляр стоит ${formatTenge(extraBook.unitPrice)}. Обычно расходы делят все дети и внуки.`,
          },
        ]
      : []),
  ];

  return (
    <>
      <section className="bg-shezhire-indigo text-shezhire-paper">
        <Container wide className="grid items-center gap-12 py-12 lg:grid-cols-[1fr_1.1fr] lg:py-20">
          <div>
            <OrnamentMark className="h-8 text-shezhire-gold" />
            <h1 className="mt-6 font-display text-[clamp(3rem,6.4vw,6rem)] leading-[0.95] font-medium">
              Книга вашего рода, которую передадут внукам
            </h1>
            <p className="mt-6 max-w-[46ch] text-lg leading-[1.75] text-shezhire-paper/80">
              Соберём шежіре всей семьёй: древо до семи поколений, отреставрированные фотографии и истории, которые
              рассказывают за дастарханом. Печатаем книгу и интерьерное древо в раме.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
              <ButtonLink
                href={href('/create')}
                size="lg"
                className="bg-shezhire-gold! text-shezhire-night! hover:brightness-105"
              >
                Начать шежіре
              </ButtonLink>
              <p className="text-shezhire-paper/70">
                от {formatTenge(priceFrom)}, предоплата {formatTenge(product.deposit)}
              </p>
            </div>
          </div>
          <div className="rounded-card border border-shezhire-gold/30 p-4 sm:p-8">
            <GrowingTree />
          </div>
        </Container>
        <OrnamentBand className="text-shezhire-gold/45" />
      </section>

      <section>
        <Container wide className="grid gap-12 py-16 lg:grid-cols-2 lg:py-24">
          <div className="flex items-center justify-center gap-6 sm:gap-10">
            <BookMock />
            <PosterMock />
          </div>
          <div className="self-center">
            <h2 className="font-display text-5xl leading-[1.05] font-medium lg:text-6xl">Что останется у семьи</h2>
            <dl className="mt-10 space-y-7">
              {[
                ['Книга рода', 'Летопись семьи по ветвям: кто откуда родом, кем работал, как познакомились бабушка с дедушкой.'],
                ['Древо в раме', 'Интерьерный постер или холст со всеми поколениями. Обычно его вешают в гостиной у старших.'],
                ['Цифровой архив', 'Все отреставрированные фото в хорошем качестве, чтобы раздать родственникам.'],
              ].map(([title, text]) => (
                <div key={title} className="border-l-2 border-shezhire-gold pl-5">
                  <dt className="font-display text-2xl font-semibold">{title}</dt>
                  <dd className="mt-1 max-w-[52ch] leading-[1.75] text-muted">{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </section>

      <section className="border-y border-line bg-surface">
        <Container wide className="grid items-center gap-12 py-16 lg:grid-cols-[1fr_0.8fr] lg:py-24">
          <div>
            <h2 className="font-display text-5xl leading-[1.05] font-medium lg:text-6xl">Старые фото снова чёткие</h2>
            <p className="mt-6 max-w-[50ch] text-lg leading-[1.75] text-muted">
              Пятна, заломы и выцветание убираем нейросетью, а потом каждый снимок проверяет ретушёр. Лица остаются
              родными: мы ничего не дорисовываем.
            </p>
            <p className="mt-4 max-w-[50ch] leading-[1.75] text-muted">Подвиньте ползунок, чтобы сравнить.</p>
          </div>
          <div className="mx-auto w-full max-w-sm">
            <Restoration />
          </div>
        </Container>
      </section>

      <section>
        <Container wide className="py-16 lg:py-24">
          <h2 className="font-display text-5xl leading-[1.05] font-medium lg:text-6xl">Собираем всей семьёй</h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="font-display text-5xl leading-none text-shezhire-madder">{toRoman(i + 1)}</span>
                <h3 className="mt-4 font-display text-2xl font-semibold">{step.title}</h3>
                <p className="mt-2 leading-[1.75] text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section id="prices" className="bg-shezhire-indigo text-shezhire-paper">
        <OrnamentBand className="text-shezhire-gold/45" />
        <Container wide className="py-16 lg:py-24">
          <h2 className="font-display text-5xl leading-[1.05] font-medium lg:text-6xl">Варианты</h2>
          <p className="mt-4 max-w-[56ch] leading-[1.75] text-shezhire-paper/70">
            Сначала предоплата {formatTenge(product.deposit)}, остальное после того, как вы одобрите макет книги.
          </p>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {product.formats.map((format) => (
              <article
                key={format.id}
                className={cn(
                  'flex flex-col rounded-card border p-7',
                  format.recommended ? 'border-shezhire-gold bg-shezhire-night' : 'border-shezhire-paper/20',
                )}
              >
                {format.recommended && <p className="mb-3 text-sm text-shezhire-gold">Выбирают чаще всего</p>}
                <h3 className="font-display text-3xl font-semibold">{format.name}</h3>
                <p className="mt-2 leading-[1.7] text-shezhire-paper/70">{format.description}</p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {format.specs.map((spec) => (
                    <li key={spec} className="flex gap-3 leading-snug">
                      <OrnamentMark className="mt-1 h-3 shrink-0 text-shezhire-gold" />
                      {spec}
                    </li>
                  ))}
                </ul>
                <p className="mt-8 font-display text-4xl font-semibold text-shezhire-gold">{formatTenge(format.price)}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section>
        <Container wide className="grid gap-10 py-16 lg:grid-cols-[0.6fr_1fr] lg:py-24">
          <h2 className="font-display text-5xl leading-[1.05] font-medium lg:text-6xl">Частые вопросы</h2>
          <Faq items={faq} />
        </Container>
      </section>

      <section className="bg-shezhire-night text-shezhire-paper">
        <Container wide className="flex flex-col items-center gap-8 py-20 text-center">
          <OrnamentMark className="h-10 text-shezhire-gold" />
          <p className="max-w-[22ch] font-display text-[clamp(2.4rem,5vw,4.5rem)] leading-[1.05] font-medium">
            Жеті атаңды біл. Начните со своего имени.
          </p>
          <ButtonLink href={href('/create')} size="lg" className="bg-shezhire-gold! text-shezhire-night!">
            Начать шежіре
          </ButtonLink>
        </Container>
      </section>
    </>
  );
}

function toRoman(n: number) {
  return ['I', 'II', 'III', 'IV', 'V', 'VI'][n - 1] ?? String(n);
}

function BookMock() {
  return (
    <div
      aria-hidden
      className="relative flex aspect-[3/4] w-[46%] max-w-60 flex-col items-center justify-center rounded-r-md bg-shezhire-indigo px-4 text-center text-shezhire-gold shadow-[inset_8px_0_0_rgba(0,0,0,0.25),0_24px_40px_-20px_rgba(24,33,63,0.7)]"
    >
      <div className="absolute inset-3 rounded-sm border border-shezhire-gold/50" />
      <OrnamentMark className="h-7" />
      <p className="mt-4 font-display text-lg leading-tight font-semibold sm:text-2xl">Сейтқалиевтер әулеті</p>
      <p className="mt-2 text-xs tracking-wide sm:text-sm">шежіре</p>
    </div>
  );
}

function PosterMock() {
  return (
    <div aria-hidden className="w-[40%] max-w-52 rotate-2 border-[9px] border-[#5a4026] bg-shezhire-paper p-3 shadow-[0_24px_40px_-22px_rgba(0,0,0,0.6)]">
      <svg viewBox="0 0 100 130" className="w-full text-shezhire-indigo">
        <g fill="none" stroke="currentColor" strokeWidth="0.8">
          <path d="M50 18V35H20V52M50 35V52M50 35H80V52M20 60V72H10V86M20 72H30V86M50 60V86M80 60V72H70V86M80 72H90V86M30 94V106M50 94V106H40V116M50 106H60V116" />
        </g>
        <g fill="currentColor">
          {[
            [50, 14], [20, 56], [50, 56], [80, 56], [10, 90], [30, 90], [50, 90], [70, 90], [90, 90], [30, 110], [40, 120], [60, 120],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" />
          ))}
        </g>
      </svg>
    </div>
  );
}
