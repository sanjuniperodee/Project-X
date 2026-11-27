import type { DraftContent } from '@px/contracts';
import { describeStep } from '../prompts/describe';
import type { DraftGenerator, DraftRequest } from './generator';

/**
 * Deterministic generator that needs no external API: arranges the answers
 * into sections so the designer gets a structured brief. Default in development.
 */
export class TemplateDraftGenerator implements DraftGenerator {
  readonly id = 'template';

  async generate({ product, project }: DraftRequest): Promise<DraftContent> {
    const sections = product.steps
      .filter((step) => step.audience === 'owner')
      .map((step) => ({ heading: step.title, body: describeStep(step, project.answers[step.id]) }))
      .filter((section) => section.body.length > 0);

    const contributorSteps = product.steps.filter((s) => s.audience === 'contributor');
    const cards = project.contributions.map((contribution) => ({
      title: contribution.authorName,
      text: contributorSteps.map((s) => describeStep(s, contribution.answers[s.id])).filter(Boolean).join('\n'),
    }));

    return {
      title: `${product.name}: ${project.subject}`,
      lead: `Материалы собраны: ${sections.length} разделов анкеты и ${cards.length} ${pluralizeContributions(cards.length)}.`,
      sections,
      cards,
    };
  }
}

function pluralizeContributions(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'вклад участника';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'вклада участников';
  return 'вкладов участников';
}
