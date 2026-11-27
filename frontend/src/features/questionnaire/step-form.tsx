'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { validateStep, type StepAnswers, type WizardStep } from '@px/contracts';
import { ApiError } from '@/shared/api/core';
import { Button } from '@/shared/ui/button';
import { FieldInput, fieldErrors } from './field-input';
import { initialValues, type Errors, type Values } from './values';

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'error'; message: string };

const AUTOSAVE_DELAY = 1500;

/**
 * One questionnaire step with autosave. Saves in draft mode (required fields
 * may stay empty); completeness is checked on submit.
 */
export function StepForm({
  step,
  saved,
  readOnly,
  externalErrors,
  onSave,
}: {
  step: WizardStep;
  saved: StepAnswers | undefined;
  readOnly: boolean;
  /** Errors from a failed submit, relative to this step. */
  externalErrors: Errors;
  onSave: (answers: StepAnswers) => Promise<void>;
}) {
  const idPrefix = useId();
  const [values, setValues] = useState<Values>(() => initialValues(step, saved));
  const [errors, setErrors] = useState<Errors>(externalErrors);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // New submit errors from the parent replace what is shown (React's "adjust state on prop change" pattern).
  const [shownExternal, setShownExternal] = useState(externalErrors);
  if (externalErrors !== shownExternal) {
    setShownExternal(externalErrors);
    setErrors(externalErrors);
  }

  const save = useCallback(
    async (current: Values) => {
      const check = validateStep(step, current, 'draft');
      if (!check.ok) {
        setErrors(check.errors);
        setState({ kind: 'error', message: 'Исправьте отмеченные поля, чтобы сохранить.' });
        return;
      }
      dirty.current = false;
      setState({ kind: 'saving' });
      try {
        await onSave(check.data);
        setErrors({});
        setState({ kind: 'saved', at: new Date() });
      } catch (error) {
        dirty.current = true;
        if (error instanceof ApiError) {
          if (Object.keys(error.fields).length) setErrors(error.fields);
          setState({ kind: 'error', message: error.message });
        } else {
          setState({ kind: 'error', message: 'Не сохранилось. Проверьте интернет.' });
        }
      }
    },
    [onSave, step],
  );

  // Latest values live in a ref too: uploads finish asynchronously and must not overwrite newer edits.
  const latest = useRef(values);

  const change = (fieldId: string, value: unknown) => {
    const next = { ...latest.current, [fieldId]: value };
    latest.current = next;
    dirty.current = true;
    setValues(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), AUTOSAVE_DELAY);
    setErrors((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => k !== fieldId && !k.startsWith(`${fieldId}.`))),
    );
  };

  // Flush pending changes when leaving the step; warn before closing the tab with unsaved edits.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      clearTimeout(timer.current);
      if (dirty.current) void saveRef.current(latest.current);
    };
  }, []);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        clearTimeout(timer.current);
        void save(values);
      }}
      className="flex flex-col gap-8"
    >
      <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-8 disabled:opacity-80">
        {step.fields.map((field) => (
          <FieldInput
            key={field.id}
            field={field}
            value={values[field.id]}
            onChange={(v) => change(field.id, v)}
            errors={fieldErrors(errors, field.id)}
            idPrefix={idPrefix}
          />
        ))}
      </fieldset>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
          <Button type="submit" variant="secondary" loading={state.kind === 'saving'}>
            Сохранить
          </Button>
          <SaveStatus state={state} />
        </div>
      )}
    </form>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  const text =
    state.kind === 'saving'
      ? 'Сохраняем…'
      : state.kind === 'saved'
        ? `Сохранено в ${state.at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
        : state.kind === 'error'
          ? state.message
          : 'Изменения сохраняются автоматически';
  return (
    <p aria-live="polite" className={state.kind === 'error' ? 'text-sm font-medium text-danger' : 'text-sm text-muted'}>
      {text}
    </p>
  );
}
