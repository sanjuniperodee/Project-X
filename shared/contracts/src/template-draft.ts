import type { DraftContent } from './drafts';
import type { Field, StepAnswers, WizardStep } from './fields';
import type { Product } from './products';

/**
 * Draft built from the answers alone, without a model: the questionnaire laid out as sections, the friends' stories
 * as cards. Used for the preview the customer sees before sending the materials (and by the ai service's template
 * generator). The real draft — written by Claude after the submit — replaces it.
 */
export function templateDraft(input: {
  product: Pick<Product, 'name' | 'steps'>;
  subject: string;
  answers: Record<string, StepAnswers>;
  contributions: { authorName: string; answers: Record<string, StepAnswers> }[];
}): DraftContent {
  const { product, subject, answers, contributions } = input;
  const sections = product.steps
    .filter((step) => step.audience === 'owner')
    .map((step) => ({ heading: step.title, body: describeAnswers(step, answers[step.id]) }))
    .filter((section) => section.body.length > 0);
  const contributorSteps = product.steps.filter((s) => s.audience === 'contributor');
  const cards = contributions.map((c) => ({
    title: c.authorName,
    text: contributorSteps.map((s) => describeAnswers(s, c.answers[s.id])).filter(Boolean).join('\n'),
  }));
  return { title: `${product.name}: ${subject}`, lead: '', sections, cards };
}

/** Answers of one step as labelled plain text, with the product's own field labels. */
export function describeAnswers(step: WizardStep, answers: StepAnswers | undefined): string {
  if (!answers) return '';
  return step.fields
    .map((field) => describeField(field, answers[field.id]))
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

function describeField(field: Field, value: unknown, indent = ''): string | null {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
  switch (field.type) {
    case 'photos':
      return `${indent}${field.label}: ${(value as unknown[]).length} фото`;
    case 'select':
    case 'choice': {
      const values = Array.isArray(value) ? value : [value];
      const labels = values.map((v) => field.options.find((o) => o.value === v)?.label ?? String(v));
      return `${indent}${field.label}: ${labels.join(', ')}`;
    }
    case 'list': {
      const items = (value as Record<string, unknown>[]).map((item, index) => {
        const lines = field.fields
          .map((f) => describeField(f, item[f.id], `${indent}  `))
          .filter(Boolean)
          .join('\n');
        return `${indent}- ${field.itemLabel} ${index + 1}:\n${lines}`;
      });
      return `${indent}${field.label}:\n${items.join('\n')}`;
    }
    default:
      return `${indent}${field.label}: ${String(value)}`;
  }
}
