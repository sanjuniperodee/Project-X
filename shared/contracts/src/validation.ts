import { z } from 'zod';
import { MediaRef, type Field, type LeafField, type WizardStep } from './fields';

/**
 * Turns declarative field definitions into zod validators.
 *
 * Two modes:
 * - `draft`  — types and limits are checked, required fields may be empty.
 *              Used for autosave, so people can fill a questionnaire in several sittings.
 * - `final`  — required fields must be filled. Used on submit / contribution.
 */
export type ValidationMode = 'draft' | 'final';

const EMPTY = z.literal('');

function leafValidator(field: LeafField, mode: ValidationMode): z.ZodType {
  const required = mode === 'final' && field.required;

  switch (field.type) {
    case 'text':
    case 'textarea': {
      const base = z.string().trim().max(field.maxLength, `Не больше ${field.maxLength} символов`);
      return required ? base.min(1, 'Заполните это поле') : base.default('');
    }
    case 'date': {
      const base = z.iso.date({ message: 'Укажите дату полностью' });
      return required ? base : z.union([base, EMPTY]).default('');
    }
    case 'select': {
      const base = z.enum(optionValues(field.options), { message: 'Выберите вариант из списка' });
      return required ? base : z.union([base, EMPTY]).default('');
    }
    case 'choice': {
      const values = optionValues(field.options);
      if (field.multiple) {
        const base = z.array(z.enum(values));
        return required ? base.min(1, 'Выберите хотя бы один вариант') : base.default([]);
      }
      const base = z.enum(values, { message: 'Выберите вариант' });
      return required ? base : z.union([base, EMPTY]).default('');
    }
    case 'photos': {
      const min = required ? Math.max(field.min, 1) : mode === 'final' ? field.min : 0;
      return z
        .array(MediaRef)
        .max(field.max, `Не больше ${field.max} фото`)
        .min(min, `Добавьте хотя бы ${min} фото`)
        .default([]);
    }
  }
}

function fieldValidator(field: Field, mode: ValidationMode): z.ZodType {
  if (field.type !== 'list') return leafValidator(field, mode);

  const item = z.object(Object.fromEntries(field.fields.map((f) => [f.id, leafValidator(f, mode)])));
  const required = mode === 'final' && field.required;
  const min = required ? Math.max(field.min, 1) : mode === 'final' ? field.min : 0;
  return z
    .array(item)
    .max(field.max, `Не больше ${field.max} записей`)
    .min(min, `Добавьте хотя бы ${min}`)
    .default([]);
}

function optionValues(options: { value: string }[]): [string, ...string[]] {
  const values = options.map((o) => o.value);
  if (values.length === 0) throw new Error('Choice field must have at least one option');
  return values as [string, ...string[]];
}

/** Validator for one step's answers. Unknown keys are stripped. */
export function stepValidator(step: Pick<WizardStep, 'fields'>, mode: ValidationMode = 'final') {
  return z.object(Object.fromEntries(step.fields.map((f) => [f.id, fieldValidator(f, mode)])));
}

/** Dot path ("guests.0.name") -> first error message for that path. */
export type FieldErrors = Record<string, string>;

export type StepValidationResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; errors: FieldErrors };

export function validateStep(
  step: Pick<WizardStep, 'fields'>,
  values: unknown,
  mode: ValidationMode = 'final',
): StepValidationResult {
  const result = stepValidator(step, mode).safeParse(values ?? {});
  if (result.success) return { ok: true, data: result.data as Record<string, unknown> };

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    errors[path] ??= issue.message;
  }
  return { ok: false, errors };
}

/** True when a step passes final validation and has at least one value filled in. */
export function isStepComplete(step: Pick<WizardStep, 'fields'>, values: unknown): boolean {
  return validateStep(step, values, 'final').ok && hasAnyValue(values);
}

function hasAnyValue(values: unknown): boolean {
  if (!values || typeof values !== 'object') return false;
  return Object.values(values).some((v) => (Array.isArray(v) ? v.length > 0 : v !== '' && v != null));
}
