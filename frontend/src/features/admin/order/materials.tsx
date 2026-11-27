import type { AdminProjectView, Product } from '@px/contracts';
import { formatDateTime } from '../lib/format';
import { Panel } from '../ui/panel';
import { AnswerValue } from './answer-value';

/** The questionnaire as the customer filled it in, one collapsible block per step. */
export function Materials({ project, product }: { project: AdminProjectView; product: Product }) {
  const steps = product.steps.filter((s) => s.audience === 'owner');
  return (
    <Panel title="Анкета" aside={`${steps.filter((s) => Object.keys(project.answers[s.id] ?? {}).length > 0).length} из ${steps.length} шагов`} flush>
      <div className="divide-y divide-line">
        {steps.map((step, i) => {
          const answers = project.answers[step.id] ?? {};
          const filled = step.fields.filter((f) => {
            const v = answers[f.id];
            return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
          }).length;
          return (
            <details key={step.id} open={i === 0} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 hover:bg-bg [&::-webkit-details-marker]:hidden">
                <span className="font-medium">{step.title}</span>
                <span className="text-[13px] text-muted">
                  {filled} из {step.fields.length}
                  <span aria-hidden className="ml-2 inline-block transition-transform group-open:rotate-90">›</span>
                </span>
              </summary>
              <dl className="grid gap-x-6 gap-y-3 px-4 pt-1 pb-4 md:grid-cols-2">
                {step.fields.map((field) => (
                  <div key={field.id} className={field.type === 'list' || field.type === 'photos' || field.type === 'textarea' ? 'md:col-span-2' : ''}>
                    <dt className="text-[12px] text-muted">{field.label}</dt>
                    <dd className="mt-0.5">
                      <AnswerValue field={field} value={answers[field.id]} />
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          );
        })}
      </div>
    </Panel>
  );
}

/** Stories and photos sent by invited friends, relatives or colleagues. */
export function Contributions({ project, product }: { project: AdminProjectView; product: Product }) {
  const steps = product.steps.filter((s) => s.audience === 'contributor');
  if (steps.length === 0) return null;
  return (
    <Panel title={`Вклады: ${product.collaboration.contributorNoun}`} aside={project.contributions.length} flush>
      {project.contributions.length === 0 ? (
        <p className="px-4 py-5 text-muted">Пока никто не прислал историю по ссылке-приглашению.</p>
      ) : (
        <ol className="divide-y divide-line">
          {project.contributions.map((c) => (
            <li key={c.id} className="px-4 py-3">
              <p className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{c.authorName}</span>
                <span className="text-[12px] text-muted">{formatDateTime(c.createdAt)}</span>
              </p>
              <dl className="mt-1.5 flex flex-col gap-1.5">
                {steps.flatMap((step) =>
                  step.fields.map((field) => (
                    <div key={`${step.id}.${field.id}`} className="grid gap-2 sm:grid-cols-[160px_1fr]">
                      <dt className="text-[13px] text-muted">{field.label}</dt>
                      <dd>
                        <AnswerValue field={field} value={c.answers[step.id]?.[field.id]} />
                      </dd>
                    </div>
                  )),
                )}
              </dl>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
