'use client';

import { useId, useState, type FormEvent } from 'react';
import { validateStep, type Answers, type WizardStep } from '@px/contracts';
import { browserApi } from '@/shared/api/browser';
import { ApiError } from '@/shared/api/core';
import { Button } from '@/shared/ui/button';
import { describedBy, FieldShell, Input } from '@/shared/ui/form';
import { Notice } from '@/shared/ui/notice';
import { FieldInput, fieldErrors } from '../questionnaire/field-input';
import { initialValues, scopeErrors, type Errors, type Values } from '../questionnaire/values';

/** Form for an invited friend or relative. All contributor steps on one page. */
export function ContributionForm({
  inviteKey,
  steps,
  thanks,
}: {
  inviteKey: string;
  steps: WizardStep[];
  thanks: string;
}) {
  const uid = useId();
  const [authorName, setAuthorName] = useState('');
  const [values, setValues] = useState<Record<string, Values>>(() =>
    Object.fromEntries(steps.map((s) => [s.id, initialValues(s, undefined)])),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const change = (stepId: string, fieldId: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [stepId]: { ...prev[stepId], [fieldId]: value } }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const nextErrors: Errors = {};
    if (authorName.trim().length < 2) nextErrors.authorName = 'Подпишитесь, чтобы вас узнали';
    const answers: Answers = {};
    for (const step of steps) {
      const result = validateStep(step, values[step.id], 'final');
      if (result.ok) answers[step.id] = result.data;
      else for (const [path, message] of Object.entries(result.errors)) nextErrors[`answers.${step.id}.${path}`] = message;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setFormError('Заполните отмеченные поля.');
      return;
    }

    setSending(true);
    try {
      await browserApi.contribute(inviteKey, { authorName: authorName.trim(), answers });
      setSent(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setSending(false);
      if (error instanceof ApiError) {
        setErrors(error.fields);
        setFormError(error.message);
      } else {
        setFormError('Не получилось отправить. Проверьте интернет и попробуйте ещё раз.');
      }
    }
  }

  if (sent) {
    return (
      <div className="rounded-card border-2 border-ink p-6 sm:p-10">
        <h2 className="font-display text-3xl font-semibold">Отправлено</h2>
        <p className="mt-3 max-w-[56ch] text-lg leading-relaxed">{thanks}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-10">
      <FieldShell id={`${uid}-author`} label="Как вас подписать" error={errors.authorName} required>
        <Input
          id={`${uid}-author`}
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="Дана, подруга по универу"
          maxLength={80}
          autoComplete="name"
          aria-invalid={Boolean(errors.authorName)}
          aria-describedby={describedBy(`${uid}-author`, undefined, errors.authorName)}
        />
      </FieldShell>

      {steps.map((step) => {
        const stepErrors = scopeErrors(errors, `answers.${step.id}`);
        return (
          <section key={step.id} className="flex flex-col gap-8">
            {steps.length > 1 && <h2 className="font-display text-2xl font-semibold">{step.title}</h2>}
            {step.fields.map((field) => (
              <FieldInput
                key={field.id}
                field={field}
                value={values[step.id]?.[field.id]}
                onChange={(v) => change(step.id, field.id, v)}
                errors={fieldErrors(stepErrors, field.id)}
                idPrefix={`${uid}-${step.id}`}
              />
            ))}
          </section>
        );
      })}

      {formError && <Notice tone="danger">{formError}</Notice>}
      <div>
        <Button type="submit" size="lg" loading={sending}>
          Отправить
        </Button>
      </div>
    </form>
  );
}
