import Anthropic from '@anthropic-ai/sdk';
import { DraftContent, MAGAZINE_RUBRICS } from '@px/contracts';
import { describeProject } from '../prompts/describe';
import { PRODUCT_INSTRUCTIONS, revisionBrief, SYSTEM_PROMPT } from '../prompts/instructions';
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

  constructor(options: { apiKey: string; model: string }) {
    this.client = new Anthropic({ apiKey: options.apiKey, maxRetries: 3 });
    this.model = options.model;
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
          content: `${PRODUCT_INSTRUCTIONS[request.product.id]}\n\n<materials>\n${describeProject(request)}\n</materials>${request.revision ? revisionBrief(request.revision) : ''}`,
        },
      ],
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
