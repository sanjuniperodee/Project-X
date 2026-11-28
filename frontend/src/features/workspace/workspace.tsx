'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  isEditable,
  isStepComplete,
  ownerSteps,
  type PaymentKind,
  type Product,
  type ProjectView,
  type StepAnswers,
} from '@px/contracts';
import { browserApi } from '@/shared/api/browser';
import { ApiError } from '@/shared/api/core';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { Notice } from '@/shared/ui/notice';
import { StepForm } from '../questionnaire/step-form';
import { scopeErrors, type Errors } from '../questionnaire/values';
import { Contributions } from './contributions';
import { DraftPreview } from './draft-preview';
import { IssuePreview } from './issue-preview';
import { History } from './history';
import { InvitePanel } from './invite-panel';
import { LayoutReview } from './layout-review';
import { PaymentPanel } from './payment-panel';
import { StatusTimeline } from './status-timeline';

export interface WorkspaceCopy {
  title: string;
  submitLabel: string;
  submitHint: string;
  inviteMessage: string;
  draftCardsTitle: string;
}

const POLL_INTERVAL = 2000;
const POLL_ATTEMPTS = 15;

export function Workspace({
  editKey,
  initialProject,
  product,
  copy,
  inviteUrl,
  returnedFrom,
  voiceHref,
}: {
  editKey: string;
  initialProject: ProjectView;
  product: Product;
  copy: WorkspaceCopy;
  inviteUrl: string;
  /** Set when the customer came back from the payment page. */
  returnedFrom: PaymentKind | null;
  /** The voice studio for this project. */
  voiceHref: string;
}) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const steps = useMemo(() => ownerSteps(product), [product]);
  const [activeId, setActiveId] = useState(steps[0]!.id);
  const [submitErrors, setSubmitErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const editable = isEditable(project.status);
  const active = steps.find((s) => s.id === activeId) ?? steps[0]!;
  const activeIndex = steps.indexOf(active);
  const completed = steps.filter((s) => isStepComplete(s, project.answers[s.id]));

  // Payment is confirmed asynchronously (provider → payments → event → projects); poll until it lands.
  const awaitingStatus = returnedFrom === 'deposit' ? 'draft' : returnedFrom === 'balance' ? 'awaiting_approval' : null;
  const confirming = awaitingStatus !== null && project.status === awaitingStatus;
  const confirmedStatus = returnedFrom === 'deposit' ? 'deposit_paid' : returnedFrom === 'balance' ? 'paid' : null;
  const [attempts, setAttempts] = useState(0);
  useEffect(() => {
    if (!confirming || attempts >= POLL_ATTEMPTS) return;
    const t = setTimeout(() => {
      setAttempts((a) => a + 1);
      router.refresh();
    }, POLL_INTERVAL);
    return () => clearTimeout(t);
  }, [confirming, attempts, router]);

  const save = useCallback(
    async (stepId: string, answers: StepAnswers) => {
      const updated = await browserApi.saveStep(editKey, stepId, answers);
      setProject(updated);
    },
    [editKey],
  );

  async function submit() {
    setSubmitMessage(null);
    setSubmitting(true);
    try {
      const updated = await browserApi.submit(editKey);
      setProject(updated);
      setSubmitErrors({});
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitErrors(error.fields);
        const firstStep = steps.find((s) => Object.keys(scopeErrors(error.fields, s.id)).length > 0);
        if (firstStep) setActiveId(firstStep.id);
        setSubmitMessage(firstStep ? `Не хватает ответов в шаге «${firstStep.title}».` : error.message);
      } else {
        setSubmitMessage('Не получилось отправить. Проверьте интернет и попробуйте ещё раз.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const stepErrors = useMemo(() => scopeErrors(submitErrors, active.id), [submitErrors, active.id]);

  return (
    <div className="flex flex-col gap-14">
      <header className="flex flex-col gap-8">
        <h1 className="font-display text-4xl leading-tight font-semibold sm:text-5xl">{copy.title}</h1>
        <StatusTimeline status={project.status} />
        {confirmedStatus === project.status && (
          <Notice tone="success" title="Оплата получена">
            Спасибо! Мы прислали подтверждение в WhatsApp.
          </Notice>
        )}
        {confirming && attempts >= POLL_ATTEMPTS && (
          <Notice title="Оплата ещё обрабатывается">
            Если деньги списались, ничего делать не нужно: статус обновится в течение нескольких минут.
          </Notice>
        )}
      </header>

      {editable && (
        <Link
          href={voiceHref}
          className="group flex flex-wrap items-center justify-between gap-x-8 gap-y-3 rounded-card bg-ink px-6 py-5 text-bg transition-opacity hover:opacity-90"
        >
          <span>
            <span className="block font-display text-2xl font-semibold">Не хочется печатать? Расскажите голосом</span>
            <span className="mt-1 block max-w-[62ch] leading-relaxed opacity-75">
              Редактор задаст вопросы вслух и сам заполнит анкету. Фото можно перетащить на экран, макет придёт через пару минут после разговора.
            </span>
          </span>
          <span className="font-semibold underline decoration-2 underline-offset-4">Открыть голосовую студию</span>
        </Link>
      )}
      <LayoutReview editKey={editKey} project={project} onChange={setProject} />
      {/* Before the first layout the draft shows what the texts will be; after it, the layout says it all. */}
      {project.draft && !project.layout && <DraftPreview draft={project.draft} cardsTitle={copy.draftCardsTitle} />}
      {/* Until the submit: the issue from the customer's own answers (or how to unlock it before the deposit). */}
      {editable && !project.layout && <IssuePreview editKey={editKey} project={project} />}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <section aria-labelledby="questionnaire-title" className="min-w-0">
          <h2 id="questionnaire-title" className="sr-only">
            Анкета
          </h2>
          <nav aria-label="Шаги анкеты" className="relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ol className="flex min-w-max gap-2 border-b border-line sm:min-w-0 sm:flex-wrap">
              {steps.map((step, i) => {
                const isActive = step.id === active.id;
                const done = completed.includes(step);
                const hasError = Object.keys(scopeErrors(submitErrors, step.id)).length > 0;
                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(step.id)}
                      aria-current={isActive ? 'step' : undefined}
                      className={cn(
                        '-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-[15px] transition-colors',
                        isActive ? 'border-ink font-semibold' : 'border-transparent text-muted hover:text-ink',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-6 items-center justify-center rounded-full border text-xs',
                          hasError ? 'border-danger text-danger' : done ? 'border-ink bg-ink text-bg' : 'border-line',
                        )}
                      >
                        {done && !hasError ? '✓' : i + 1}
                      </span>
                      {step.title}
                      <span className="sr-only">{done ? ', заполнен' : ', не заполнен'}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="mt-8">
            <h3 className="font-display text-3xl font-semibold">{active.title}</h3>
            {active.description && <p className="mt-2 max-w-[60ch] leading-relaxed text-muted">{active.description}</p>}
            <div className="mt-8">
              <StepForm
                key={active.id}
                step={active}
                saved={project.answers[active.id]}
                readOnly={!editable}
                externalErrors={stepErrors}
                onSave={(answers) => save(active.id, answers)}
              />
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
            {activeIndex > 0 ? (
              <Button variant="ghost" onClick={() => setActiveId(steps[activeIndex - 1]!.id)}>
                Назад: {steps[activeIndex - 1]!.title}
              </Button>
            ) : (
              <span />
            )}
            {activeIndex < steps.length - 1 && (
              <Button variant="secondary" onClick={() => setActiveId(steps[activeIndex + 1]!.id)}>
                Дальше: {steps[activeIndex + 1]!.title}
              </Button>
            )}
          </div>

          {editable && (
            <div className="mt-12 rounded-card border-2 border-ink p-6">
              <h3 className="font-display text-2xl font-semibold">
                {completed.length === steps.length ? 'Всё готово к отправке' : `Заполнено ${completed.length} из ${steps.length}`}
              </h3>
              <p className="mt-2 max-w-[60ch] leading-relaxed text-muted">
                {project.status === 'draft'
                  ? 'Отправить материалы можно после предоплаты — а сразу после неё здесь появится превью.'
                  : `Сначала пролистайте превью выше и поправьте ответы, если нужно. ${copy.submitHint}`}
              </p>
              {submitMessage && (
                <div className="mt-4">
                  <Notice tone="danger">{submitMessage}</Notice>
                </div>
              )}
              <Button
                size="lg"
                className="mt-5"
                loading={submitting}
                disabled={project.status !== 'deposit_paid'}
                onClick={() => void submit()}
              >
                {copy.submitLabel}
              </Button>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-6">
          <PaymentPanel editKey={editKey} project={project} confirming={confirming && attempts < POLL_ATTEMPTS} />
          {product.collaboration.enabled && (
            <InvitePanel
              title={product.collaboration.inviteTitle}
              description={`Отправьте ссылку: ${product.collaboration.contributorNoun} добавят истории и фото, не видя ответов друг друга.`}
              url={inviteUrl}
              message={copy.inviteMessage}
              count={project.contributions.length}
              accepting={editable}
            />
          )}
          <History items={project.history} />
        </aside>
      </div>

      <Contributions product={product} items={project.contributions} noun={product.collaboration.contributorNoun} />
    </div>
  );
}
