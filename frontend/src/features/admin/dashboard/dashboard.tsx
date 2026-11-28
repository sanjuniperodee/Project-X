import Link from 'next/link';
import { formatTenge, PROJECT_STATUSES_ACTIVE, type AdminStats, type ProductId, type ProjectListItem } from '@px/contracts';
import { cn } from '@/shared/lib/cn';
import { DailyChart, type DailySeries } from '../charts/daily-chart';
import { Sparkline } from '../charts/sparkline';
import { studioAttention } from '../lib/attention';
import { percent } from '../lib/format';
import { ordersHref } from '../lib/orders-query';
import { OrdersTable } from '../orders/orders-table';
import { switchScope } from '../scope/actions';
import { ProjectMark } from '../scope/project-mark';
import { project, type Scope } from '../scope/projects';
import { Icons } from '../ui/icons';
import { PageHeader } from '../ui/page-header';
import { Panel, PanelLink } from '../ui/panel';

const BEFORE_PRINT = PROJECT_STATUSES_ACTIVE.filter((s) => s !== 'printing' && s !== 'shipped').join(',');
type Attention = AdminStats['attention'];

/** What the studio has to do now, in the order the work happens. Each queue opens the filtered order list. */
const QUEUES: Array<{ key: keyof Attention; label: string; hint: string; filters: Record<string, string>; client?: boolean }> = [
  { key: 'unpaid', label: 'Без предоплаты больше 2 дней', hint: 'Написать или позвонить', filters: { status: 'draft', sort: 'created' } },
  { key: 'handoff', label: 'Вёрстка вручную', hint: 'Автовёрстка остановилась', filters: { status: 'in_design', design: 'studio' } },
  { key: 'awaitingApproval', label: 'Ждут согласования клиента', hint: 'Ход за клиентом: напомнить про макет', filters: { status: 'awaiting_approval' }, client: true },
  { key: 'toPrint', label: 'Оплачены, пора в печать', hint: 'Отправить в типографию', filters: { status: 'paid' } },
  { key: 'toShip', label: 'Напечатаны, пора в доставку', hint: 'Передать курьеру', filters: { status: 'printing' } },
  { key: 'deadlineSoon', label: 'Праздник в ближайшие 14 дней', hint: 'Номер ещё не напечатан', filters: { status: BEFORE_PRINT, sort: 'deadline' } },
];

const today = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', weekday: 'long', day: 'numeric', month: 'long' });

export function Dashboard({
  scope,
  stats,
  perProject,
  deadlines,
  latest,
}: {
  scope: Scope;
  stats: AdminStats;
  perProject: Array<{ id: ProductId; stats: AdminStats }>;
  deadlines: ProjectListItem[];
  latest: ProjectListItem[];
}) {
  const current = scope ? project(scope) : null;
  const series: DailySeries[] = scope
    ? [{ id: scope, name: current!.name, color: current!.color, revenue: stats.daily.map((d) => d.revenue), orders: stats.daily.map((d) => d.orders) }]
    : perProject.map(({ id, stats: s }) => ({ id, name: project(id).name, color: project(id).color, revenue: s.daily.map((d) => d.revenue), orders: s.daily.map((d) => d.orders) }));
  const attentionTotal = studioAttention(stats.attention);

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        mark={<ProjectMark id={scope} size={36} />}
        title={current ? current.name : 'Все проекты'}
        description={<span className="first-letter:uppercase">{today.format(new Date())}</span>}
        actions={
          <>
            <Link href={ordersHref({ view: 'board' })} className="inline-flex h-9 items-center gap-2 rounded-control border border-line bg-surface px-3.5 text-[13px] font-medium hover:border-zinc-300">
              <Icons.board width={16} height={16} />
              Доска заказов
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Metric label="Оплачено в этом месяце" value={formatTenge(stats.month.revenue)} current={stats.month.revenue} previous={stats.previousMonth.revenue} money />
        <Metric label="Новых заказов в этом месяце" value={String(stats.month.orders)} current={stats.month.orders} previous={stats.previousMonth.orders} />
        <Metric label="В работе сейчас" value={String(stats.active)} note={attentionTotal ? `${attentionTotal} ждут действия студии` : 'всё под контролем'} />
        <Metric label="Средний чек" value={formatTenge(stats.averageCheck)} note="заказы с предоплатой" />
      </div>

      {!scope && (
        <section aria-label="Проекты" className="grid gap-4 md:grid-cols-3">
          {perProject.map(({ id, stats: s }) => (
            <ProjectCard key={id} id={id} stats={s} />
          ))}
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Последние 30 дней" className="min-w-0">
            <DailyChart dates={stats.daily.map((d) => d.date)} series={series} />
          </Panel>
          <Funnel funnel={stats.funnel} />
        </div>
        <Panel className="self-start" title="Требует действия" aside={attentionTotal ? <span title="Ждут действия студии">{attentionTotal}</span> : undefined} flush>
          <ul className="divide-y divide-line">
            {QUEUES.map((q) => {
              const count = stats.attention[q.key];
              return (
                <li key={q.key}>
                  <Link href={ordersHref({ ...q.filters, productId: scope ?? undefined })} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-zinc-50">
                    <span className="min-w-0 flex-1">
                      <span className={cn('block font-medium', count === 0 && 'text-muted')}>{q.label}</span>
                      <span className="block text-[12px] text-muted">{q.hint}</span>
                      {!scope && count > 0 && (
                        <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                          {perProject
                            .filter((p) => p.stats.attention[q.key] > 0)
                            .map((p) => (
                              <span key={p.id} className="inline-flex items-center gap-1 text-[12px] text-zinc-600">
                                <span aria-hidden className="size-1.5 rounded-full" style={{ background: project(p.id).color }} />
                                {project(p.id).name} {p.stats.attention[q.key]}
                              </span>
                            ))}
                        </span>
                      )}
                    </span>
                    <span className={cn('min-w-8 text-right text-[22px] font-semibold tabular-nums', count === 0 ? 'text-zinc-300' : q.client && 'text-zinc-500')}>{count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel title="Ближайшие праздники" description="Номер ещё не напечатан, праздник скоро" aside={<PanelLink href={ordersHref({ status: BEFORE_PRINT, sort: 'deadline', productId: scope ?? undefined })}>Все</PanelLink>} flush>
        <OrdersTable items={deadlines} empty="Нет заказов с датой праздника" compact showProject={!scope} />
      </Panel>
      <Panel title="Новые заказы" aside={<PanelLink href={ordersHref({ sort: 'created', productId: scope ?? undefined })}>Все</PanelLink>} flush>
        <OrdersTable items={latest} empty="Заказов пока нет" compact showProject={!scope} />
      </Panel>
    </div>
  );
}

function Metric({ label, value, note, current, previous, money }: { label: string; value: string; note?: string; current?: number; previous?: number; money?: boolean }) {
  const delta = current !== undefined && previous !== undefined ? current - previous : null;
  return (
    <div className="min-w-0 rounded-card border border-line bg-surface px-4 py-4 shadow-[0_1px_2px_rgba(24,24,27,0.04)] sm:px-5">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1.5 text-[22px] leading-none font-semibold tracking-[-0.02em] sm:text-[28px]">{value}</p>
      <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted">
        {delta !== null ? (
          <>
            <span
              className={cn(
                'inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 font-medium',
                delta > 0 ? 'bg-emerald-50 text-emerald-800' : delta < 0 ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-600',
              )}
            >
              {delta > 0 ? <Icons.arrowUp width={12} height={12} /> : delta < 0 ? <Icons.arrowDown width={12} height={12} /> : null}
              {delta === 0 ? 'без изменений' : money ? formatTenge(Math.abs(delta)) : Math.abs(delta)}
            </span>
            к прошлому месяцу
          </>
        ) : (
          note
        )}
      </p>
    </div>
  );
}

/** One project in the overview of all projects: its money, work and trend; a click opens its mode. */
function ProjectCard({ id, stats }: { id: ProductId; stats: AdminStats }) {
  const p = project(id);
  const attention = studioAttention(stats.attention);
  const action = switchScope.bind(null, id, '/admin');
  return (
    <form action={action}>
      <button
        type="submit"
        className="group flex w-full flex-col gap-4 rounded-card border border-line bg-surface p-5 text-left shadow-[0_1px_2px_rgba(24,24,27,0.04)] transition-[border-color,box-shadow] hover:border-zinc-300 hover:shadow-[0_6px_20px_-8px_rgba(24,24,27,0.18)]"
      >
        <span className="flex w-full items-center gap-3">
          <ProjectMark id={id} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{p.name}</span>
            <span className="block text-[12px] text-muted">в работе {stats.active}</span>
          </span>
          <span className="text-[13px] text-muted transition-colors group-hover:text-ink">Открыть</span>
        </span>
        <span className="flex w-full items-end justify-between gap-4">
          <span>
            <span className="block text-[24px] leading-none font-semibold tracking-[-0.02em]">{formatTenge(stats.month.revenue)}</span>
            <span className="mt-1.5 block text-[12px] text-muted">
              оплачено в этом месяце, заказов {stats.month.orders}
            </span>
          </span>
          <Sparkline values={stats.daily.map((d) => d.orders)} color={p.color} label={`Заказы ${p.name} по дням за 30 дней`} width={104} height={40} />
        </span>
        <span className={cn('flex w-full items-center gap-2 border-t border-line pt-3 text-[13px]', attention ? 'text-ink' : 'text-muted')}>
          <span aria-hidden className={cn('size-2 rounded-full', attention ? 'bg-amber-500' : 'bg-emerald-500')} />
          {attention ? `${attention} ждут действия студии` : 'Срочных дел нет'}
        </span>
      </button>
    </form>
  );
}

/** Orders of the last 90 days: how many paid the deposit and how many paid in full. */
function Funnel({ funnel }: { funnel: AdminStats['funnel'] }) {
  const steps = [
    { label: 'Создали заказ', value: funnel.created, note: '' },
    { label: 'Внесли предоплату', value: funnel.deposit, note: percent(funnel.deposit, funnel.created) },
    { label: 'Оплатили полностью', value: funnel.paid, note: percent(funnel.paid, funnel.created) },
  ];
  const max = Math.max(1, funnel.created);
  return (
    <Panel title="Воронка за 90 дней" description="Сколько заказов дошли до оплаты">
      <ol className="flex flex-col gap-4">
        {steps.map((s, i) => (
          <li key={s.label}>
            <p className="flex items-baseline justify-between gap-3 text-[13px]">
              <span>{s.label}</span>
              <span>
                <span className="text-[15px] font-semibold">{s.value}</span>
                {s.note && <span className="ml-1.5 text-muted">{s.note}</span>}
              </span>
            </p>
            <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-zinc-100">
              <span className="block h-full rounded-full bg-ink" style={{ width: `${(s.value / max) * 100}%`, opacity: 1 - i * 0.25 }} />
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
