import type { Field, LeafField, MediaRef, StepAnswers, WizardStep } from '@px/contracts';

export type Values = Record<string, unknown>;
/** Path relative to the step ("players.0.name") → message. */
export type Errors = Record<string, string>;

export function emptyValue(field: Field | LeafField): unknown {
  switch (field.type) {
    case 'photos':
    case 'list':
      return [];
    case 'choice':
      return field.multiple ? [] : '';
    default:
      return '';
  }
}

export function emptyItem(fields: LeafField[]): Values {
  return Object.fromEntries(fields.map((f) => [f.id, emptyValue(f)]));
}

/** Saved answers merged over empty defaults, so every input is controlled from the start. */
export function initialValues(step: Pick<WizardStep, 'fields'>, saved: StepAnswers | undefined): Values {
  return Object.fromEntries(step.fields.map((f) => [f.id, saved?.[f.id] ?? emptyValue(f)]));
}

export const asString = (v: unknown) => (typeof v === 'string' ? v : '');
export const asStrings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
export const asMedia = (v: unknown) => (Array.isArray(v) ? (v as MediaRef[]) : []);
export const asItems = (v: unknown) => (Array.isArray(v) ? (v as Values[]) : []);

/** Errors under `prefix.` re-keyed relative to it. */
export function scopeErrors(errors: Errors, prefix: string): Errors {
  const scoped: Errors = {};
  for (const [path, message] of Object.entries(errors)) {
    if (path.startsWith(`${prefix}.`)) scoped[path.slice(prefix.length + 1)] = message;
  }
  return scoped;
}

export function countFilled(step: Pick<WizardStep, 'fields'>, values: StepAnswers | undefined): number {
  if (!values) return 0;
  return step.fields.filter((f) => {
    const v = values[f.id];
    return Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim() !== '' : v != null;
  }).length;
}
