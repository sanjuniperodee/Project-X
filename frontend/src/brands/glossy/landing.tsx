import Image from 'next/image';
import { formatTenge } from '@px/contracts';
import { Faq } from '../_shared/faq';
import type { LandingProps } from '../types';
import { ButtonLink } from '@/shared/ui/button';
import { Container } from '@/shared/ui/container';
import { cn } from '@/shared/lib/cn';
import { IssueReader } from './issue-reader';
import { LiveCover } from './live-cover';
import { SAMPLE_PAGE_SIZE, samplePage } from './sample-issue';
import { StyleShowcase } from './style-showcase';

const CTA = 'Собрать журнал';

/** How questionnaire answers turn into pages: each rubric with the page it produced in the sample issue. */
const RUBRICS = [
  {
    page: 4,
    title: 'Досье',
    answer: 'Дата рождения, город и чем занимается',
    result: 'Страница-анкета с портретом и знаком зодиака',
  },
  {
    page: 5,
    title: 'Большое интервью',
    answer: 'Самая яркая история, детство, мечта',
    result: 'Разворот с фото и очерком на две колонки',
  },
  {
    page: 7,
    title: 'Вкусы героя',
    answer: 'Любимая еда, музыка, место и коронная фраза',
    result: 'Рубрика в духе модных журналов',
  },
  {
    page: 8,
    title: 'Хронология',
    answer: 'Главные годы и фото того времени',
    result: 'Жизнь в датах — от рождения до сегодня',
  },
  {
    page: 9,
    title: 'В цифрах',
    answer: '«17 стран», «0 опозданий на плов»',
    result: 'Инфографика на чёрном развороте',
  },
  {
    page: 10,
    title: 'Гороскоп номера',
    answer: 'Дата рождения — и больше ничего',
    result: 'Шуточный гороскоп, который пишет ИИ про вашего человека',
  },
  {
    page: 12,
    title: 'Правила жизни',
    answer: 'Принципы, по которым живёт герой',
    result: 'Нумерованный список и большой портрет',
  },
  {
    page: 13,
    title: 'Говорят друзья',
    answer: 'Друзья пишут истории по вашей ссылке',
    result: 'У каждого своя страница с фото и пожеланием',
  },
  {
    page: 17,
    title: 'Одним словом',
    answer: 'Каждый друг описывает героя одним словом',
    result: 'Плакат из слов на розовой странице',
  },
] as const;

const STEPS = [
  { title: 'Заполните анкету', time: '20 минут', text: 'Про героя, его правила, вкусы и главные годы. Можно частями: всё сохраняется.' },
  { title: 'Позовите друзей', time: '2–3 дня', text: 'Киньте ссылку в общий чат. Друзья пишут истории и шлют фото, герой ничего не знает.' },
  { title: 'Получите макет', time: 'на следующий день', text: 'Редакция пишет тексты и верстает номер. Вы листаете его прямо на сайте и просите правки.' },
  { title: 'Держите в руках', time: 'от 7 дней', text: 'После согласования печатаем на плотной мелованной бумаге и привозим.' },
];

export function GlossyLanding({ product, href }: LandingProps) {
  const guestCopy = product.extras.find((e) => e.id === 'guest-copy');
  const priceFrom = Math.min(...product.formats.map((f) => f.price));
  const large = product.formats.find((f) => f.recommended) ?? product.formats.at(-1)!;

  const faq = [
    {
      q: 'Сколько ждать журнал?',
      a: `Макет готов на следующий день после того, как вы отправите материалы. После согласования печать и доставка занимают ${product.productionDays} дней. Если праздник скоро, добавьте срочное производство.`,
    },
    {
      q: 'Сколько нужно фотографий?',
      a: 'Для номера на 24 страницы хватит 20 снимков с телефона, для 36 страниц лучше от 40. Для обложки нужен один вертикальный портрет, где хорошо видно лицо. Чем больше кадров, тем богаче фотосессия.',
    },
    {
      q: 'Какой стиль выбрать?',
      a: '«Глянец» подходит почти всем. «Таблоид» — если компания любит подшучивать над именинником. «Нежность» — для годовщин, мам и бабушек. «Нуар» — для юбилеев, мужчин и всего, что должно выглядеть солидно. Стиль можно поменять, пока анкета не отправлена в редакцию.',
    },
    {
      q: 'Можно сделать журнал про пару или компанию?',
      a: 'Да. Героем номера может быть пара на годовщину свадьбы, семья, команда или компания к юбилею. Анкета та же, просто отвечайте про всех.',
    },
    {
      q: 'Друзья увидят, что написали другие?',
      a: 'Нет. Каждый видит только свою форму. Все истории собираются у вас и в редакции, а герой узнаёт обо всём, когда откроет журнал.',
    },
    {
      q: 'Что если мне не понравится макет?',
      a: 'Напишите, что поменять, прямо под макетом. Мы пересоберём номер и покажем новую версию. Остаток вы платите только за макет, который одобрили.',
    },
    {
      q: 'Что входит в предоплату?',
      a: `Предоплата ${formatTenge(product.deposit)} запускает работу редакции над номером. Остальное вы платите, когда увидите и одобрите готовый макет.`,
    },
  ];

  return (
    <>
      {/* Hero */}
      <section className="border-b-2 border-black">
        <Container wide className="grid items-center gap-12 py-10 lg:grid-cols-12 lg:gap-10 lg:py-16">
          <div className="flex flex-col gap-10 lg:col-span-7 lg:gap-14">
            <h1 className="font-display text-[clamp(3.25rem,8.4vw,8.5rem)] leading-[0.9] font-black tracking-[-0.035em]">
              Журнал, где на обложке ваш человек
            </h1>
            <div className="grid gap-8 sm:grid-cols-2 sm:items-end">
              <p className="max-w-[42ch] text-lg leading-relaxed">
                Настоящий глянец на {product.formats.map((f) => f.name.match(/\d+/)?.[0]).filter(Boolean).join(' или ')}{' '}
                страниц об одном человеке: досье, интервью, правила жизни, гороскоп, фотосессия и истории от друзей. В одном из четырёх стилей — от чёрно-белого глянца до громкого таблоида.
              </p>
              <div className="flex flex-col items-start gap-3">
                <ButtonLink href={href('/create')} size="lg" className="bg-black! text-white! hover:bg-glossy-fuchsia!">
                  {CTA}
                </ButtonLink>
                <p className="text-sm text-muted">
                  от {formatTenge(priceFrom)}, сначала только предоплата {formatTenge(product.deposit)}
                </p>
              </div>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[440px] lg:col-span-5 lg:mr-0">
            <LiveCover />
          </div>
        </Container>
      </section>

      {/* Four styles */}
      <section id="styles" className="border-b-2 border-black">
        <Container wide className="py-16 lg:py-24">
          <div className="mb-12 grid gap-6 lg:grid-cols-12">
            <h2 className="font-display text-5xl leading-[0.95] font-black tracking-tight lg:col-span-7 lg:text-7xl">
              Один человек&nbsp;— четыре разных журнала
            </h2>
            <p className="max-w-[44ch] self-end leading-relaxed text-muted lg:col-span-4 lg:col-start-9">
              Это один и тот же номер, свёрстанный в четырёх стилях. Стиль выбираете в анкете — от него зависят шрифты,
              цвета, обложка и даже голос текстов.
            </p>
          </div>
          <StyleShowcase />
        </Container>
      </section>

      {/* Sample issue */}
      <section id="issue" className="overflow-hidden border-b-2 border-black bg-glossy-smoke">
        <Container wide className="flex flex-wrap items-end justify-between gap-6 pt-16 pb-10 lg:pt-24">
          <h2 className="font-display text-5xl leading-none font-black tracking-tight lg:text-7xl">Листайте номер</h2>
          <p className="max-w-[46ch] leading-relaxed text-muted">
            Это настоящие страницы номера на 24 страницы. Его собрали из одной анкеты и четырёх историй друзей. Ваш номер
            будет про вашего человека.
          </p>
        </Container>
        <div className="pb-16 lg:pb-24">
          <IssueReader />
        </div>
      </section>

      {/* Answers → pages */}
      <section id="rubrics" className="border-b-2 border-black">
        <Container wide className="py-16 lg:py-24">
          <div className="grid gap-6 lg:grid-cols-12">
            <h2 className="font-display text-5xl leading-[0.95] font-black tracking-tight lg:col-span-6 lg:text-6xl">
              Вы отвечаете на вопросы. Мы делаем из ответов журнал
            </h2>
            <p className="max-w-[46ch] self-end leading-relaxed text-muted lg:col-span-5 lg:col-start-8">
              Каждый ответ в анкете становится рубрикой. Нет ответа — нет пустой страницы: номер собирается из того, что
              вы рассказали.
            </p>
          </div>
          <ol className="mt-14 grid gap-x-12 sm:grid-cols-2">
            {RUBRICS.map((rubric) => {
              const page = samplePage(rubric.page);
              return (
                <li key={rubric.title} className="flex gap-5 border-t-2 border-black py-6 sm:gap-6">
                  <Image
                    src={page.src}
                    alt={`Страница «${rubric.title}» из примера номера`}
                    width={SAMPLE_PAGE_SIZE.width}
                    height={SAMPLE_PAGE_SIZE.height}
                    sizes="112px"
                    className="h-auto w-24 shrink-0 self-start shadow-[0_10px_24px_-14px_rgba(0,0,0,0.6)] sm:w-28"
                  />
                  <div className="min-w-0">
                    <h3 className="font-display text-2xl leading-tight font-black">{rubric.title}</h3>
                    <p className="mt-3 text-sm">
                      <span className="font-semibold text-glossy-fuchsia">Вы пишете:</span> {rubric.answer}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      <span className="font-semibold text-black">В журнале:</span> {rubric.result}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Container>
      </section>

      {/* AI art direction */}
      <section className="border-b-2 border-black">
        <Container wide className="py-16 lg:py-24">
          <div className="grid gap-6 lg:grid-cols-12">
            <h2 className="font-display text-5xl leading-[0.95] font-black tracking-tight lg:col-span-7 lg:text-6xl">
              У каждого номера свой арт-директор
            </h2>
            <p className="max-w-[46ch] self-end leading-relaxed text-muted lg:col-span-4 lg:col-start-9">
              Номер оформляет ИИ, который прочитал всё, что вы и друзья рассказали. Поэтому журнал не похож на шаблон:
              он похож на вашего человека.
            </p>
          </div>
          <div className="mt-14 grid gap-px bg-black lg:grid-cols-3">
            <article className="flex flex-col gap-6 bg-white p-6 sm:p-8">
              <h3 className="text-xl font-semibold">Цвет номера — из фото обложки</h3>
              <div className="flex items-center gap-4">
                <Image src="/coverme/cover-portrait.jpg" alt="" width={96} height={144} className="h-28 w-20 object-cover object-[50%_25%]" />
                <span aria-hidden className="text-2xl">→</span>
                <span className="grid size-20 place-items-end bg-[#aa0e2d] p-2 text-xs font-semibold text-white">#AA0E2D</span>
              </div>
              <p className="leading-relaxed text-muted">
                Красный свитер на обложке — и весь номер получает глубокий красный: плашки, цифры, цитаты.
              </p>
            </article>
            <article className="flex flex-col gap-6 bg-white p-6 sm:p-8">
              <h3 className="text-xl font-semibold">Заголовки про вашего человека</h3>
              <ul className="flex flex-col gap-3">
                {[
                  ['Вкусы героя', 'Бешбармак, флэт уайт и Ninety One'],
                  ['Правила жизни', 'Кодекс Айгерим'],
                  ['В цифрах', '17 стран и ни одного опоздания'],
                ].map(([before, after]) => (
                  <li key={before} className="flex flex-col">
                    <span className="text-sm text-muted line-through decoration-glossy-fuchsia">{before}</span>
                    <span className="font-display text-xl leading-snug font-black">{after}</span>
                  </li>
                ))}
              </ul>
            </article>
            <article className="flex flex-col gap-6 bg-white p-6 sm:p-8">
              <h3 className="text-xl font-semibold">Гороскоп, который пишется один раз</h3>
              <Image
                src={samplePage(10).src}
                alt="Страница гороскопа из примера номера"
                width={SAMPLE_PAGE_SIZE.width}
                height={SAMPLE_PAGE_SIZE.height}
                sizes="160px"
                className="h-auto w-36 shadow-[0_14px_28px_-16px_rgba(0,0,0,0.6)]"
              />
              <p className="leading-relaxed text-muted">
                «Юпитер советует купить автодом: маршрут прокладывать не нужно». Про любимые вещи, мечту и привычки героя.
              </p>
            </article>
          </div>
        </Container>
      </section>

      {/* Friends */}
      <section className="bg-black text-white">
        <Container wide className="grid items-center gap-14 py-16 lg:grid-cols-12 lg:py-24">
          <div className="lg:col-span-5">
            <h2 className="font-display text-5xl leading-[0.95] font-black tracking-tight lg:text-7xl">
              Самое интересное напишут друзья
            </h2>
            <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-white/75">
              Вы получаете секретную ссылку для общего чата. Каждый пишет историю, пожелание и одно слово о герое, добавляет
              общие фото. В номере у каждого своя страница.
            </p>
          </div>
          <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center lg:col-span-6 lg:col-start-7">
            <div className="max-w-sm bg-[#1f2c34] p-5 text-[15px] leading-relaxed sm:p-6">
              <p className="text-xs text-white/50">Чат «Др Айгерим 🎉» · 4 участника</p>
              <p className="mt-3 rounded-lg rounded-tl-none bg-[#005c4b] p-3">
                Девочки, делаем Айгерим журнал про неё 🤫 Напишите самую смешную историю с ней, это 5 минут. Ей ни слова!
                <span className="mt-2 block break-all text-[#53bdeb] underline underline-offset-2">coverme.kz/invite/k3J9xQ</span>
              </p>
              <p className="mt-3 w-fit rounded-lg rounded-tl-none bg-[#202c33] p-3 ring-1 ring-white/10">Уже написала! 😂</p>
            </div>
            <Image
              src={samplePage(13).src}
              alt="Страница друга из примера номера"
              width={SAMPLE_PAGE_SIZE.width}
              height={SAMPLE_PAGE_SIZE.height}
              sizes="220px"
              className="h-auto w-48 rotate-3 justify-self-center shadow-[0_30px_50px_-20px_rgba(228,0,124,0.55)] sm:w-56"
            />
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section id="how" className="border-b-2 border-black">
        <Container wide className="py-16 lg:py-24">
          <h2 className="font-display text-5xl leading-none font-black tracking-tight lg:text-6xl">Как это работает</h2>
          <ol className="mt-12 grid gap-px bg-black sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="bg-white p-6 pb-10 sm:p-8">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-display text-6xl leading-none font-black italic">{i + 1}</span>
                  <span className="text-sm font-semibold text-glossy-fuchsia">{step.time}</span>
                </div>
                <h3 className="mt-6 text-xl font-semibold">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* In hand */}
      <section className="overflow-hidden border-b-2 border-black">
        <Container wide className="grid items-center gap-16 py-16 lg:grid-cols-2 lg:py-24">
          <PrintedMagazine />
          <div>
            <h2 className="font-display text-5xl leading-[0.95] font-black tracking-tight lg:text-6xl">
              Как настоящий, только про своего
            </h2>
            <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6">
              {[
                ['Формат', 'A4, как у глянцевых журналов'],
                ['Страниц', product.formats.map((f) => f.name.match(/\d+/)?.[0]).filter(Boolean).join(' или ')],
                ['Бумага', large.specs.find((s) => /бумага/i.test(s)) ?? 'Мелованная'],
                ['Обложка', large.specs.find((s) => /обложк/i.test(s)) ?? 'Мягкая глянцевая'],
              ].map(([term, value]) => (
                <div key={term} className="border-t-2 border-black pt-3">
                  <dt className="text-sm text-muted">{term}</dt>
                  <dd className="mt-1 text-lg font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            {guestCopy && (
              <p className="mt-10 max-w-[52ch] text-lg leading-relaxed">
                На праздник часто берут журналы для гостей: {guestCopy.name.toLowerCase()} стоит{' '}
                <strong className="font-semibold">{formatTenge(guestCopy.unitPrice)}</strong>. Гости увозят номер домой, а
                герой получает автографы на последних страницах.
              </p>
            )}
          </div>
        </Container>
      </section>

      {/* Prices */}
      <section id="prices" className="border-b-2 border-black">
        <Container wide className="py-16 lg:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="font-display text-5xl leading-none font-black tracking-tight lg:text-6xl">Цены</h2>
            <p className="max-w-[44ch] leading-relaxed text-muted">
              Предоплата {formatTenge(product.deposit)}. Остальное — после того, как вы одобрите макет.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {product.formats.map((format) => (
              <article
                key={format.id}
                className={cn('flex flex-col border-2 border-black p-6 sm:p-10', format.recommended && 'bg-black text-white')}
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
                <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-10">
                  <p className="font-display text-5xl font-black italic">{formatTenge(format.price)}</p>
                  <ButtonLink
                    href={href('/create')}
                    className={cn(
                      format.recommended ? 'bg-glossy-fuchsia! text-white! hover:bg-white! hover:text-black!' : 'bg-black! text-white! hover:bg-glossy-fuchsia!',
                    )}
                  >
                    Выбрать
                  </ButtonLink>
                </div>
              </article>
            ))}
          </div>
          {product.extras.length > 0 && (
            <ul className="mt-10 grid gap-x-10 gap-y-4 sm:grid-cols-3">
              {product.extras.map((extra) => (
                <li key={extra.id} className="border-t border-black pt-3">
                  <p className="font-semibold">
                    {extra.name} <span className="text-glossy-fuchsia">+{formatTenge(extra.unitPrice)}</span>
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{extra.description}</p>
                </li>
              ))}
            </ul>
          )}
        </Container>
      </section>

      {/* FAQ */}
      <section>
        <Container wide className="grid gap-10 py-16 lg:grid-cols-12 lg:py-24">
          <h2 className="font-display text-5xl leading-none font-black tracking-tight lg:col-span-4 lg:text-6xl">Вопросы</h2>
          <Faq items={faq} className="lg:col-span-8" />
        </Container>
      </section>

      {/* Final call */}
      <section className="bg-glossy-fuchsia text-white">
        <Container wide className="flex flex-col items-start gap-8 py-16 lg:py-24">
          <p className="max-w-[14ch] font-display text-[clamp(3rem,7vw,7rem)] leading-[0.9] font-black tracking-tight italic">
            Ваш человек заслуживает обложки
          </p>
          <ButtonLink href={href('/create')} size="lg" className="bg-black! text-white! hover:bg-white! hover:text-black!">
            {CTA}
          </ButtonLink>
        </Container>
      </section>
    </>
  );
}

/** The printed issue in 3D: cover, spine and a stack of page edges. */
function PrintedMagazine() {
  const cover = samplePage(1);
  return (
    <div aria-hidden className="mx-auto w-full max-w-[380px] [perspective:1600px]">
      <div className="relative [transform-style:preserve-3d] [transform:rotateY(-24deg)_rotateX(6deg)]">
        {/* Page edges, slightly offset behind the cover. */}
        <div className="absolute inset-0 translate-x-[6px] translate-y-[3px] bg-[repeating-linear-gradient(90deg,#fff_0_1px,#e8e4e6_1px_2px)] [transform:translateZ(-10px)]" />
        <div className="absolute inset-y-0 left-0 w-3 origin-left bg-black [transform:rotateY(90deg)]" />
        <Image
          src={cover.src}
          alt=""
          width={SAMPLE_PAGE_SIZE.width}
          height={SAMPLE_PAGE_SIZE.height}
          sizes="380px"
          className="relative block h-auto w-full shadow-[30px_40px_60px_-30px_rgba(0,0,0,0.6)]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/25 via-transparent to-black/10" />
      </div>
    </div>
  );
}
