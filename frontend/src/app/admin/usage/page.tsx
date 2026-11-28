import Link from 'next/link';
import { PageHeader } from '@/features/admin/ui/page-header';
import { Panel } from '@/features/admin/ui/panel';
import { api } from '@/shared/api/server';

export const dynamic = 'force-dynamic';

const PURPOSE: Record<string, string> = {
  'sales/reply': 'ИИ-продажник: ответы в WhatsApp',
  'sales/follow_up': 'ИИ-продажник: напоминания',
  'sales/trial': 'Проверка бота в админке',
  'ai/draft': 'Черновик текстов номера',
  'ai/revision': 'Правки по комментарию клиента',
};

const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;
const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} млн` : n >= 1000 ? `${Math.round(n / 1000)} тыс` : String(n));

interface Row {
  key: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  label?: string;
}

function Rows({ rows, label }: { rows: Row[]; label: (key: string, label?: string) => string }) {
  if (!rows.length) return <p className="text-muted">Пока нет вызовов.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-muted">
        <tr>
          <th className="py-1.5 font-normal" />
          <th className="py-1.5 text-right font-normal">вызовов</th>
          <th className="py-1.5 text-right font-normal">вход / кеш / выход</th>
          <th className="py-1.5 text-right font-normal">стоимость</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="py-1.5 pr-3">{label(r.key, r.label)}</td>
            <td className="py-1.5 text-right tabular-nums">{r.calls}</td>
            <td className="py-1.5 text-right tabular-nums text-muted">
              {tokens(r.inputTokens)} / {tokens(r.cacheReadTokens)} / {tokens(r.outputTokens)}
            </td>
            <td className="py-1.5 text-right font-medium tabular-nums">{usd(r.costUsd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = Math.min(366, Math.max(1, Number((await searchParams).days) || 30));
  const s = await api.admin.usage(days);
  const dayLabel = (k: string) => new Date(`${k}T12:00:00+05:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader title="Расходы на ИИ" description={s.note} />
      <div className="flex gap-3 text-sm">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`/admin/usage?days=${d}`} className={d === days ? 'font-semibold underline underline-offset-4' : 'text-muted hover:underline'}>
            {d} дней
          </Link>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Panel title="Сегодня">
          <div className="text-2xl font-semibold tabular-nums">{usd(s.today.costUsd)}</div>
          <div className="text-sm text-muted">{s.today.calls} вызовов</div>
        </Panel>
        <Panel title={`За ${days} дней`}>
          <div className="text-2xl font-semibold tabular-nums">{usd(s.total.costUsd)}</div>
          <div className="text-sm text-muted">{s.total.calls} вызовов</div>
        </Panel>
        <Panel title="В среднем в день">
          <div className="text-2xl font-semibold tabular-nums">{usd(s.total.costUsd / Math.max(1, s.byDay.length))}</div>
          <div className="text-sm text-muted">по дням с вызовами</div>
        </Panel>
      </div>
      <Panel title="На что тратится">
        <Rows rows={s.byPurpose} label={(k) => PURPOSE[k] ?? k} />
      </Panel>
      <Panel title="Модели">
        <Rows rows={s.byModel} label={(k) => k} />
      </Panel>
      <Panel title="Самые дорогие чаты и заказы">
        <Rows rows={s.topConversations} label={(k, label) => (k.startsWith('order:') ? `Заказ ${label ?? ''}` : label || k)} />
      </Panel>
      <Panel title="По дням">
        <Rows rows={s.byDay} label={dayLabel} />
      </Panel>
    </div>
  );
}
