import { formatTenge } from '@px/contracts';
import { Faq } from '../_shared/faq';
import type { LandingProps } from '../types';
import { ButtonLink } from '@/shared/ui/button';
import { Container } from '@/shared/ui/container';
import { cn } from '@/shared/lib/cn';
import { LiveCover } from './live-cover';

const CONTENTS = [
  { page: '02', title: 'Письмо редактора', text: 'Пара слов от вас — почему этот номер вообще случился.' },
  { page: '04', title: 'Большое интервью', text: 'Детство, первые победы, любимые словечки. Редактор соберёт из ваших ответов живой текст.' },
  { page: '12', title: 'Правила жизни', text: 'Фирменная рубрика: десять коротких правил, по которым живёт герой.' },
  { page: '16', title: 'Фотосессия', text: 'Развороты из ваших фото: детские, свадебные, самые неудачные.' },
  { page: '24', title: 'Инсайды от друзей', text: 'Истории и пожелания, которые друзья пишут по вашей ссылке.' },
  { page: '32', title: 'Хронология', text: 'Год за годом: переезды, дипломы, свадьбы и прочие главные события.' },
];

const STEPS = [
  { title: 'Ответьте на вопросы', text: 'Анкета на 15 минут: про героя, правила жизни и фото. Можно заполнять частями.' },
  { title: 'Позовите друзей', text: 'Отправьте ссылку в общий чат. Друзья пишут истории, а герой ничего не знает.' },
  { title: 'Мы верстаем номер', text: 'Редактор дописывает тексты, дизайнер собирает обложку и развороты.' },
  { title: 'Согласуйте и получите', text: 'Покажем макет, внесём правки и напечатаем.' },
];

export function GlossyLanding({ product, href }: LandingProps) {
  const guestCopy = product.extras.find((e) => e.id === 'guest-copy');
  const priceFrom = Math.min(...product.formats.map((f) => f.price));

  const faq = [
    {
      q: 'Сколько ждать журнал?',
      a: `После того как вы согласуете макет, печать и доставка занимают ${product.productionDays} дней. Если праздник скоро, добавьте срочное производство.`,
    },
    {
      q: 'А если фотографий мало или они плохого качества?',
      a: 'Хватит 15–20 снимков с телефона. Для обложки подберём лучший кадр и обработаем его. Если кадр совсем не подходит, предложим простую фотосъёмку.',
    },
    {
      q: 'Друзья увидят, что написали другие?',
      a: 'Нет. Каждый видит только свою форму. Все истории собираются у вас и у редактора.',
    },
    {
      q: 'Что входит в предоплату?',
      a: `Предоплата ${formatTenge(product.deposit)} закрепляет за вами редактора и дизайнера. Остальное вы платите, когда увидите и одобрите готовый макет.`,
    },
  ];

  return (
    <>
      <section className="border-b-2 border-black">
        <Container wide className="grid items-center gap-12 py-10 lg:grid-cols-12 lg:gap-10 lg:py-14">
          <div className="flex flex-col gap-10 lg:col-span-7 lg:gap-14">
            <h1 className="font-display text-[clamp(3.25rem,8.4vw,8.5rem)] leading-[0.9] font-black tracking-[-0.035em]">
              Журнал, где на обложке ваш человек
            </h1>
            <div className="grid gap-8 sm:grid-cols-2 sm:items-end">
              <p className="max-w-[42ch] text-lg leading-relaxed">
                Настоящий глянец об одном человеке, паре или компании: интервью, правила жизни, фотосессия и истории
                от друзей.
              </p>
              <div className="flex flex-col items-start gap-3">
                <ButtonLink href={href('/create')} size="lg" className="bg-black! text-white! hover:bg-glossy-fuchsia!">
                  {brandCta}
                </ButtonLink>
                <p className="text-sm text-muted">
                  от {formatTenge(priceFrom)}, сначала только предоплата {formatTenge(product.deposit)}
                </p>
              </div>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[420px] lg:col-span-5 lg:mr-0">
            <LiveCover />
          </div>
        </Container>
      </section>

      <section id="contents" className="border-b-2 border-black">
        <Container wide className="grid gap-10 py-16 lg:grid-cols-12 lg:py-24">
          <div className="lg:col-span-4">
            <h2 className="font-display text-5xl leading-none font-black tracking-tight lg:text-6xl">В номере</h2>
            <p className="mt-5 max-w-[34ch] leading-relaxed text-muted">
              Так выглядит содержание журнала на 36 страниц. Рубрики можно менять под героя.
            </p>
          </div>
          <ol className="grid gap-x-10 sm:grid-cols-2 lg:col-span-8">
            {CONTENTS.map((item) => (
              <li key={item.page} className="flex gap-5 border-t border-black py-6">
                <span className="w-14 shrink-0 font-display text-4xl leading-none font-black italic text-glossy-fuchsia">
                  {item.page}
                </span>
                <div>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-1.5 leading-relaxed text-muted">{item.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className="bg-black text-white">
        <Container wide className="grid gap-12 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <h2 className="font-display text-5xl leading-[0.95] font-black tracking-tight lg:text-7xl">
              Самое интересное напишут друзья
            </h2>
            <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-white/75">
              Вы получаете секретную ссылку для общего чата. Каждый друг пишет историю, пожелание и добавляет общие фото.
              В журнал это попадает отдельной рубрикой.
            </p>
          </div>
          <div className="self-center border border-white/30 p-6 sm:p-8">
            <p className="text-sm text-white/60">Сообщение в чат «Др Айгерим 🎉»</p>
            <p className="mt-4 text-xl leading-relaxed">
              Девочки, делаем Айгерим журнал про неё. Напишите самую смешную историю с ней, это 5 минут. Ей ни слова!
            </p>
            <p className="mt-4 break-all text-glossy-fuchsia underline underline-offset-4">coverme.kz/invite/k3J9xQ</p>
          </div>
        </Container>
      </section>

      <section id="how" className="border-b-2 border-black">
        <Container wide className="py-16 lg:py-24">
          <h2 className="font-display text-5xl leading-none font-black tracking-tight lg:text-6xl">Как это работает</h2>
          <ol className="mt-12 grid gap-px bg-black sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="bg-white p-6 pb-10 sm:p-8">
                <span className="font-display text-6xl leading-none font-black italic">{i + 1}</span>
                <h3 className="mt-6 text-xl font-semibold">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section id="prices" className="border-b-2 border-black">
        <Container wide className="py-16 lg:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="font-display text-5xl leading-none font-black tracking-tight lg:text-6xl">Цены</h2>
            <p className="max-w-[44ch] leading-relaxed text-muted">
              Предоплата {formatTenge(product.deposit)}. Остальное после того, как вы одобрите макет.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {product.formats.map((format) => (
              <article
                key={format.id}
                className={cn(
                  'flex flex-col border-2 border-black p-6 sm:p-10',
                  format.recommended && 'bg-black text-white',
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-display text-3xl leading-tight font-bold sm:text-4xl">{format.name}</h3>
                  {format.recommended && (
                    <span className="shrink-0 bg-glossy-fuchsia px-2.5 py-1 text-sm font-semibold">Чаще выбирают</span>
                  )}
                </div>
                <p className={cn('mt-3 leading-relaxed', format.recommended ? 'text-white/70' : 'text-muted')}>
                  {format.description}
                </p>
                <ul className="mt-6 space-y-2">
                  {format.specs.map((spec) => (
                    <li key={spec} className="flex gap-3">
                      <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-current" />
                      {spec}
                    </li>
                  ))}
                </ul>
                <p className="mt-10 font-display text-5xl font-black italic">{formatTenge(format.price)}</p>
              </article>
            ))}
          </div>
          {guestCopy && (
            <p className="mt-8 max-w-[60ch] text-lg leading-relaxed">
              На праздник часто берут журналы для гостей: {guestCopy.name.toLowerCase()} стоит{' '}
              <strong className="font-semibold">{formatTenge(guestCopy.unitPrice)}</strong>.
            </p>
          )}
        </Container>
      </section>

      <section>
        <Container wide className="grid gap-10 py-16 lg:grid-cols-12 lg:py-24">
          <h2 className="font-display text-5xl leading-none font-black tracking-tight lg:col-span-4 lg:text-6xl">
            Вопросы
          </h2>
          <Faq items={faq} className="lg:col-span-8" />
        </Container>
      </section>

      <section className="bg-glossy-fuchsia text-white">
        <Container wide className="flex flex-col items-start gap-8 py-16 lg:py-24">
          <p className="max-w-[14ch] font-display text-[clamp(3rem,7vw,7rem)] leading-[0.9] font-black tracking-tight italic">
            Ваш человек заслуживает обложки
          </p>
          <ButtonLink href={href('/create')} size="lg" className="bg-black! text-white! hover:bg-white! hover:text-black!">
            {brandCta}
          </ButtonLink>
        </Container>
      </section>
    </>
  );
}

const brandCta = 'Собрать журнал';
