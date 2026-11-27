import type { ProductId } from '@px/contracts';
import { boardgameTemplate } from './boardgame';
import { glossyTemplate } from './glossy';
import { shezhireTemplate } from './shezhire';
import type { Template } from './template';

/** One template per product. A new product needs a template here (TypeScript enforces it). */
export const TEMPLATES: Record<ProductId, Template> = {
  glossy: glossyTemplate,
  shezhire: shezhireTemplate,
  boardgame: boardgameTemplate,
};

export type { Template, TemplateInput, PhotoLibrary } from './template';
