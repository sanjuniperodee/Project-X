import type { Field, StepAnswers, WizardStep } from '@px/contracts';
import type { DraftRequest } from '../generators/generator';

/**
 * Renders questionnaire answers as labelled plain text, using the product's own
 * field labels — the model (and the template generator) sees exactly what the customer saw.
 */
export function describeProject({ product, project }: DraftRequest): string {
  const parts: string[] = [`Продукт: ${product.name} — ${product.tagline}`, `Герой / тема: ${project.subject}`];
  const format = product.formats.find((f) => f.id === project.formatId);
  if (format) parts.push(`Формат: ${format.name} (${format.specs.join(', ')})`);

  for (const step of product.steps.filter((s) => s.audience === 'owner')) {
    const text = describeStep(step, project.answers[step.id]);
    if (text) parts.push(`\n## ${step.title}\n${text}`);
  }

  const contributorSteps = product.steps.filter((s) => s.audience === 'contributor');
  if (project.contributions.length > 0) {
    parts.push(`\n## Материалы от участников (${product.collaboration.contributorNoun})`);
    for (const contribution of project.contributions) {
      const body = contributorSteps.map((s) => describeStep(s, contribution.answers[s.id])).filter(Boolean).join('\n');
      parts.push(`\n### ${contribution.authorName}\n${body}`);
    }
  }
  return parts.join('\n');
}

export function describeStep(step: WizardStep, answers: StepAnswers | undefined): string {
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
      const labels = values.map((v) => {
        const option = field.options.find((o) => o.value === v);
        return option ? `${option.label}${option.description ? ` (${option.description})` : ''}` : String(v);
      });
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
