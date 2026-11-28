import Anthropic from '@anthropic-ai/sdk';
import { DraftContent, MAGAZINE_RUBRICS, textToneOf, type EventPayload } from '@px/contracts';
import { describeProject } from '../prompts/describe';
import { PRODUCT_INSTRUCTIONS, revisionBrief, SYSTEM_PROMPT, toneBrief } from '../prompts/instructions';
import type { DraftGenerator, DraftRequest } from './generator';

/** JSON schema for structured outputs; mirrors the DraftContent contract. */
const DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'lead', 'sections', 'cards', 'art'],
  properties: {
    title: { type: 'string' },
    lead: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'body'],
        properties: { heading: { type: 'string' }, body: { type: 'string' } },
      },
    },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'text'],
        properties: { title: { type: 'string' }, text: { type: 'string' } },
      },
    },
    // Art direction: used by Cover Me; other products leave it empty.
    art: {
      type: 'object',
      additionalProperties: false,
      required: ['rubrics', 'tagline', 'horoscope'],
      properties: {
        rubrics: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['rubric', 'title', 'deck'],
            properties: { rubric: { type: 'string', enum: [...MAGAZINE_RUBRICS] }, title: { type: 'string' }, deck: { type: 'string' } },
          },
        },
        tagline: { type: 'string' },
        horoscope: { type: 'string' },
      },
    },
  },
} as const;

export class ClaudeDraftGenerator implements DraftGenerator {
  readonly id: string;
  private readonly client: Anthropic;
  private readonly model: string;

  private readonly onUsage?: (usage: EventPayload<'ai.llm_used'>) => void;

  constructor(options: { apiKey: string; model: string; onUsage?: (usage: EventPayload<'ai.llm_used'>) => void }) {
    this.client = new Anthropic({ apiKey: options.apiKey, maxRetries: 3 });
    this.model = options.model;
    this.onUsage = options.onUsage;
    this.id = `claude:${options.model}`;
  }

  async generate(request: DraftRequest): Promise<DraftContent> {
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16_000,
      // Server-side fallback keeps generation working if the primary model declines.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        // The magazine is mostly writing with a voice: worth a deeper pass.
        effort: request.product.id === 'glossy' ? 'high' : 'medium',
        format: { type: 'json_schema', schema: DRAFT_JSON_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: draftPrompt(request),
        },
      ],
    });

    // The studio's AI spend (/admin/usage): every billed call, refused or not.
    this.onUsage?.({
      service: 'ai',
      purpose: request.revision ? 'revision' : 'draft',
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      projectId: request.project.projectId,
    });
    if (response.stop_reason === 'refusal') {
      throw new Error(`Model declined to generate the draft (${response.stop_details?.category ?? 'no category'})`);
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error('Draft generation hit max_tokens');
    }
    const text = response.content.find((block) => block.type === 'text');
    if (!text || text.type !== 'text') throw new Error('Model returned no text block');
    return DraftContent.parse(JSON.parse(text.text));
  }
}

/** The user message: the product brief, the materials, the chosen tone and, for revisions, the previous draft. */
export function draftPrompt(request: DraftRequest): string {
  const tone = textToneOf(request.product, request.project.answers);
  const revision = request.revision ? revisionBrief(request.revision, tone) : '';
  return `${PRODUCT_INSTRUCTIONS[request.product.id]}\n\n<materials>\n${describeProject(request)}\n</materials>${toneBrief(tone)}${revision}`;
}
