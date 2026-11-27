import { LAYOUT_STATUS_LABELS, type AdminProjectView } from '@px/contracts';
import { formatDateTime } from '../lib/format';
import { Panel } from '../ui/panel';
import { Tag } from '../ui/status-badge';

/** Layout versions, newest first, with the customer's feedback, studio warnings and page previews. */
export function Layouts({ project }: { project: AdminProjectView }) {
  const { design, layouts } = project;
  const mode =
    design.mode === 'auto' ? `Автовёрстка, правок ${design.revisionsUsed} из ${design.revisionsLimit}` : 'Вёрстка вручную: новую версию загружает дизайнер';
  return (
    <Panel title="Макеты" aside={mode} flush>
      {layouts.length === 0 ? (
        <p className="px-4 py-5 text-muted">Макетов пока нет: он появится, когда клиент отправит материалы.</p>
      ) : (
        <ol className="divide-y divide-line">
          {layouts.map((layout) => (
            <li key={layout.version} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Версия {layout.version}</span>
                  <Tag tone={layout.status === 'changes_requested' ? 'warning' : 'neutral'}>{LAYOUT_STATUS_LABELS[layout.status]}</Tag>
                  <span className="text-[13px] text-muted">
                    {formatDateTime(layout.createdAt)} · {layout.pages.length} стр. · {layout.template}
                  </span>
                </p>
                <a href={layout.pdfUrl} target="_blank" rel="noreferrer" className="text-[13px] underline underline-offset-2">
                  PDF для печати
                </a>
              </div>
              {layout.feedback && (
                <p className="mt-2 rounded-[4px] border border-amber-200 bg-amber-50 px-2.5 py-1.5">
                  <span className="text-amber-800">Правки клиента: </span>
                  {layout.feedback}
                </p>
              )}
              {layout.warnings.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-[13px] text-muted">
                  {layout.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
              <ul className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
                {layout.pages.map((page) => (
                  <li key={page.number} className="shrink-0">
                    <a href={page.previewUrl} target="_blank" rel="noreferrer" title={`Стр. ${page.number}: ${page.kind}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- generated SVG preview */}
                      <img src={page.previewUrl} alt={`Страница ${page.number}`} loading="lazy" className="h-24 w-auto border border-line bg-white" width={page.widthMm} height={page.heightMm} />
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
