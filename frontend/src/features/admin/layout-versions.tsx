import { LAYOUT_STATUS_LABELS, type AdminProjectView, type LayoutStatus } from '@px/contracts';
import { cn } from '@/shared/lib/cn';
import { formatDate } from '@/shared/lib/plural';

const STATUS_TONE: Record<LayoutStatus, string> = {
  pending: 'bg-accent text-accent-ink',
  approved: 'bg-success text-white',
  changes_requested: 'bg-danger/10 text-danger',
  discarded: 'bg-ink/10 text-muted',
};

/** Every layout version made for the project, newest first, with the customer's feedback and the studio warnings. */
export function LayoutVersions({ project }: { project: AdminProjectView }) {
  const { design, layouts } = project;
  return (
    <section aria-labelledby="layouts-title" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="layouts-title" className="text-2xl font-semibold">
          Макеты
        </h2>
        <p className="text-sm text-muted">
          {design.mode === 'auto'
            ? `Автоматическая вёрстка · правок ${design.revisionsUsed} из ${design.revisionsLimit}`
            : 'Передан дизайнеру студии: новую версию готовит человек, статус «Макет готов» ставится вручную'}
        </p>
      </div>
      {layouts.length === 0 ? (
        <p className="text-muted">Макетов пока нет.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {layouts.map((layout) => (
            <li key={layout.version} className="rounded-card border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-semibold">Версия {layout.version}</p>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_TONE[layout.status])}>
                    {LAYOUT_STATUS_LABELS[layout.status]}
                  </span>
                  <span className="text-sm text-muted">
                    {formatDate(layout.createdAt)} · {layout.pages.length} стр. · {layout.template}
                  </span>
                </div>
                <a href={layout.pdfUrl} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-4">
                  PDF для печати
                </a>
              </div>
              {layout.feedback && (
                <p className="mt-3 text-[15px] leading-relaxed">
                  <span className="text-muted">Правки клиента: </span>«{layout.feedback}»
                </p>
              )}
              {layout.warnings.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-danger">
                  {layout.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
              <ul className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {layout.pages.map((page) => (
                  <li key={page.number} className="shrink-0">
                    <a href={page.previewUrl} target="_blank" rel="noreferrer" title={`Стр. ${page.number}: ${page.kind}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG preview */}
                      <img src={page.previewUrl} alt={`Страница ${page.number}`} loading="lazy" className="h-28 w-auto border border-line bg-white" width={page.widthMm} height={page.heightMm} />
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
