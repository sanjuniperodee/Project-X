import { MediaRef, type Answers, type Contribution, type Field, type Product, type StepAnswers } from '@px/contracts';

/**
 * Typed, forgiving access to questionnaire answers. Templates know the field ids of
 * their product, but must survive a question being renamed or removed in the catalog:
 * every reader returns an empty value instead of throwing.
 */
export class Materials {
  constructor(
    readonly product: Product,
    readonly answers: Answers,
  ) {}

  step(stepId: string): StepAnswers {
    return this.answers[stepId] ?? {};
  }

  text(stepId: string, fieldId: string): string {
    return asText(this.step(stepId)[fieldId]);
  }

  list(stepId: string, fieldId: string): Array<Record<string, unknown>> {
    const value = this.step(stepId)[fieldId];
    return Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null) : [];
  }

  photos(stepId: string, fieldId: string): MediaRef[] {
    return asPhotos(this.step(stepId)[fieldId]);
  }

  /** Human label of a select/choice answer, as the customer saw it. */
  optionLabel(stepId: string, fieldId: string, value = this.step(stepId)[fieldId]): string {
    const field = this.field(stepId, fieldId);
    const values = Array.isArray(value) ? value : value == null ? [] : [value];
    if (!field || (field.type !== 'select' && field.type !== 'choice')) return values.map(String).join(', ');
    return values.map((v) => field.options.find((o) => o.value === v)?.label ?? String(v)).join(', ');
  }

  field(stepId: string, fieldId: string): Field | undefined {
    return this.product.steps.find((s) => s.id === stepId)?.fields.find((f) => f.id === fieldId);
  }

  stepTitle(stepId: string): string | undefined {
    return this.product.steps.find((s) => s.id === stepId)?.title;
  }
}

export function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

export function asPhotos(value: unknown): MediaRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = MediaRef.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Every photo referenced anywhere in the answers and contributions, in questionnaire order, without duplicates. */
export function collectPhotos(product: Product, answers: Answers, contributions: Contribution[]): MediaRef[] {
  const seen = new Set<string>();
  const out: MediaRef[] = [];
  const add = (refs: MediaRef[]) => {
    for (const ref of refs) {
      if (seen.has(ref.id)) continue;
      seen.add(ref.id);
      out.push(ref);
    }
  };
  const walk = (fields: Field[], values: Record<string, unknown>) => {
    for (const field of fields) {
      const value = values[field.id];
      if (field.type === 'photos') add(asPhotos(value));
      if (field.type === 'list' && Array.isArray(value)) {
        for (const item of value) if (item && typeof item === 'object') walk(field.fields, item as Record<string, unknown>);
      }
    }
  };
  for (const step of product.steps) {
    if (step.audience === 'owner') walk(step.fields, answers[step.id] ?? {});
  }
  for (const contribution of contributions) {
    for (const step of product.steps) {
      if (step.audience === 'contributor') walk(step.fields, contribution.answers[step.id] ?? {});
    }
  }
  return out;
}

/** "/api/media/files/abc.jpg" → "abc.jpg" (the media storage key). */
export function mediaKey(ref: Pick<MediaRef, 'url'>): string | null {
  const name = ref.url.split('?')[0]!.split('/').pop() ?? '';
  return /^[A-Za-z0-9_-]+\.[a-z0-9]+$/.test(name) ? name : null;
}
