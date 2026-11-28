'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { calculateQuote, CreateProjectRequest, formatTenge, type MediaRef, type Product, type StepAnswers } from '@px/contracts';
import { browserApi } from '@/shared/api/browser';
import { clearHandoff, peekHandoff, type Handoff } from '@/shared/lib/handoff';
import { ApiError } from '@/shared/api/core';
import { useBrand } from '@/shared/lib/brand-context';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';
import { describedBy, FieldShell, Input } from '@/shared/ui/form';
import { Notice } from '@/shared/ui/notice';

export interface CreateProjectCopy {
  subjectLabel: string;
  subjectPlaceholder: string;
  subjectHint: string;
}

type Errors = Record<string, string>;

export function CreateProjectForm({ product, copy }: { product: Product; copy: CreateProjectCopy }) {
  const router = useRouter();
  const { href } = useBrand();
  const uid = useId();

  const [formatId, setFormatId] = useState(
    () => (product.formats.find((f) => f.recommended) ?? product.formats[0]!).id,
  );
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [subject, setSubject] = useState('');
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [handoff, setHandoff] = useState<Handoff | null>(null);

  // Something prepared on the landing (the Cover Me try-on): the name goes here, the rest into the questionnaire.
  useEffect(() => {
    void peekHandoff(product.id).then((found) => {
      if (!found) return;
      setHandoff(found);
      if (found.subject) setSubject((current) => current || found.subject!);
    });
  }, [product.id]);

  const quote = useMemo(() => calculateQuote(product, { formatId, extras }), [product, formatId, extras]);

  const setExtra = (id: string, quantity: number) => setExtras((prev) => ({ ...prev, [id]: quantity }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const input = { productId: product.id, subject, selection: { formatId, extras }, customer };
    const parsed = CreateProjectRequest.safeParse(input);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[issue.path.join('.')] ??= issue.message;
      setErrors(next);
      document.getElementById(`${uid}-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const created = await browserApi.createProject(parsed.data);
      if (handoff) await applyHandoff(created.editKey, handoff);
      router.push(href(`/p/${created.editKey}`));
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) setErrors(error.fields);
      setFormError(error instanceof ApiError ? error.message : 'Не получилось создать проект. Попробуйте ещё раз.');
    }
  }

  const fieldId = (path: string) => `${uid}-${path}`;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-12 lg:grid-cols-[1fr_360px] lg:items-start lg:gap-14">
      <div className="flex flex-col gap-12">
        {handoff && (
          <Notice tone="success" title="Перенесём в анкету">
            {handoff.summary}{' '}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => {
                setHandoff(null);
                void clearHandoff();
              }}
            >
              Не переносить
            </button>
          </Notice>
        )}
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-4 font-display text-2xl font-semibold">Формат</legend>
          {product.formats.map((format) => {
            const checked = format.id === formatId;
            return (
              <label
                key={format.id}
                className={cn(
                  'flex cursor-pointer gap-4 rounded-card border-2 p-5 transition-colors',
                  checked ? 'border-ink bg-surface' : 'border-ink/20 hover:border-ink/50',
                )}
              >
                <input
                  type="radio"
                  name="format"
                  value={format.id}
                  checked={checked}
                  onChange={() => setFormatId(format.id)}
                  className="mt-1.5 size-4 shrink-0 accent-[var(--c-ink)]"
                />
                <span className="flex flex-1 flex-col gap-1.5">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-lg font-semibold">{format.name}</span>
                    <span className="font-semibold whitespace-nowrap">{formatTenge(format.price)}</span>
                  </span>
                  <span className="leading-relaxed text-muted">{format.description}</span>
                  {format.specs.length > 0 && <span className="text-sm text-muted">{format.specs.join(', ')}</span>}
                </span>
              </label>
            );
          })}
        </fieldset>

        {product.extras.length > 0 && (
          <fieldset className="flex flex-col">
            <legend className="mb-4 font-display text-2xl font-semibold">Дополнительно</legend>
            <ul className="divide-y divide-line border-y border-line">
              {product.extras.map((extra) => {
                const quantity = extras[extra.id] ?? 0;
                return (
                  <li key={extra.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                    <div className="min-w-0 flex-1 basis-60">
                      <p className="font-medium">{extra.name}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted">
                        {extra.description} {formatTenge(extra.unitPrice)}
                        {extra.maxQuantity > 1 && ' за штуку'}
                      </p>
                    </div>
                    {extra.maxQuantity === 1 ? (
                      <label className="flex cursor-pointer items-center gap-2.5 text-[15px]">
                        <input
                          type="checkbox"
                          checked={quantity === 1}
                          onChange={(e) => setExtra(extra.id, e.target.checked ? 1 : 0)}
                          className="size-5 accent-[var(--c-ink)]"
                        />
                        Добавить
                      </label>
                    ) : (
                      <Stepper
                        label={extra.name}
                        value={quantity}
                        max={extra.maxQuantity}
                        onChange={(v) => setExtra(extra.id, v)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}

        <div className="flex flex-col gap-6">
          <h2 className="font-display text-2xl font-semibold">О ком подарок</h2>
          <FieldShell id={fieldId('subject')} label={copy.subjectLabel} hint={copy.subjectHint} error={errors.subject} required>
            <Input
              id={fieldId('subject')}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={copy.subjectPlaceholder}
              maxLength={80}
              aria-invalid={Boolean(errors.subject)}
              aria-describedby={describedBy(fieldId('subject'), copy.subjectHint, errors.subject)}
            />
          </FieldShell>
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <h2 className="font-display text-2xl font-semibold">Контакты</h2>
            <p className="mt-2 leading-relaxed text-muted">Напишем в WhatsApp, когда будет готов макет. Никакой рассылки.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <FieldShell id={fieldId('customer.name')} label="Ваше имя" error={errors['customer.name']} required>
              <Input
                id={fieldId('customer.name')}
                value={customer.name}
                autoComplete="name"
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                aria-invalid={Boolean(errors['customer.name'])}
                aria-describedby={describedBy(fieldId('customer.name'), undefined, errors['customer.name'])}
              />
            </FieldShell>
            <FieldShell id={fieldId('customer.phone')} label="Телефон с WhatsApp" error={errors['customer.phone']} required>
              <Input
                id={fieldId('customer.phone')}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7 701 234 56 78"
                value={customer.phone}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                aria-invalid={Boolean(errors['customer.phone'])}
                aria-describedby={describedBy(fieldId('customer.phone'), undefined, errors['customer.phone'])}
              />
            </FieldShell>
            <FieldShell id={fieldId('customer.email')} label="Email" error={errors['customer.email']}>
              <Input
                id={fieldId('customer.email')}
                type="email"
                autoComplete="email"
                value={customer.email}
                onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                aria-invalid={Boolean(errors['customer.email'])}
                aria-describedby={describedBy(fieldId('customer.email'), undefined, errors['customer.email'])}
              />
            </FieldShell>
          </div>
        </div>
      </div>

      <aside className="rounded-card border-2 border-ink bg-surface p-6 lg:sticky lg:top-6">
        <h2 className="font-display text-xl font-semibold">Ваш заказ</h2>
        <ul className="mt-5 space-y-3">
          {quote.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-4 text-[15px]">
              <span>
                {line.name}
                {line.quantity > 1 && <span className="text-muted"> × {line.quantity}</span>}
              </span>
              <span className="whitespace-nowrap">{formatTenge(line.total)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-between border-t border-line pt-4 text-lg font-semibold">
          <span>Итого</span>
          <span>{formatTenge(quote.total)}</span>
        </div>
        <dl className="mt-4 space-y-1.5 text-[15px] text-muted">
          <div className="flex justify-between gap-4">
            <dt>Предоплата сейчас</dt>
            <dd className="text-ink">{formatTenge(quote.deposit)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>После согласования макета</dt>
            <dd>{formatTenge(quote.balance)}</dd>
          </div>
        </dl>
        {formError && (
          <div className="mt-5">
            <Notice tone="danger">{formError}</Notice>
          </div>
        )}
        <Button type="submit" size="lg" loading={submitting} className="mt-6 w-full">
          Создать проект
        </Button>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Дальше откроется анкета. Предоплату можно внести сразу или после того, как заполните первые шаги.
        </p>
      </aside>
    </form>
  );
}

function Stepper({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  const btn =
    'flex size-10 items-center justify-center rounded-control border-2 border-line text-lg leading-none hover:border-ink disabled:opacity-40';
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(0, value - 1))} disabled={value === 0} aria-label="Убрать один">
        −
      </button>
      <output aria-live="polite" className="w-8 text-center font-semibold tabular-nums">
        {value}
      </output>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Добавить один">
        +
      </button>
    </div>
  );
}

/**
 * Pours the landing's handoff into the new project: answers per step, photos uploaded into their
 * fields. Best effort: whatever fails can still be filled in the questionnaire.
 */
async function applyHandoff(editKey: string, handoff: Handoff) {
  const steps: Record<string, StepAnswers> = structuredClone(handoff.answers ?? {});
  for (const photo of handoff.photos ?? []) {
    try {
      const uploaded = await browserApi.upload(new File([photo.file], photo.name, { type: photo.file.type }));
      const step = (steps[photo.stepId] ??= {});
      step[photo.fieldId] = [...((step[photo.fieldId] as MediaRef[] | undefined) ?? []), { id: uploaded.id, url: uploaded.url }];
    } catch {
      // The photo can be added in the questionnaire.
    }
  }
  await Promise.all(Object.entries(steps).map(([stepId, answers]) => browserApi.saveStep(editKey, stepId, answers).catch(() => undefined)));
  await clearHandoff();
}
