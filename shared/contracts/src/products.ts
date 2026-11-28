import { z } from 'zod';
import { WizardStep } from './fields';
import { Tenge } from './money';

export const ProductId = z.enum(['glossy', 'shezhire', 'boardgame']);
export type ProductId = z.infer<typeof ProductId>;
export const PRODUCT_IDS = ProductId.options;

const Slug = z.string().regex(/^[a-z0-9-]+$/);

/** A printable format the customer chooses (defines the base price). */
export const ProductFormat = z.object({
  id: Slug,
  name: z.string().min(1),
  description: z.string().min(1),
  /** Full price including the deposit. */
  price: Tenge,
  specs: z.array(z.string()).default([]),
  recommended: z.boolean().default(false),
});
export type ProductFormat = z.infer<typeof ProductFormat>;

/** Paid add-on, e.g. extra copies for guests or a framed canvas. */
export const ProductExtra = z.object({
  id: Slug,
  name: z.string().min(1),
  description: z.string().min(1),
  unitPrice: Tenge,
  maxQuantity: z.number().int().positive().default(1),
});
export type ProductExtra = z.infer<typeof ProductExtra>;

export const Collaboration = z.object({
  enabled: z.boolean(),
  /** What invited people are called in the UI: "друзья", "родные", "коллеги". */
  contributorNoun: z.string().min(1),
  inviteTitle: z.string().min(1),
  inviteDescription: z.string().min(1),
});
export type Collaboration = z.infer<typeof Collaboration>;

export const Product = z
  .object({
    id: ProductId,
    name: z.string().min(1),
    domain: z.string().min(1),
    tagline: z.string().min(1),
    deposit: Tenge,
    /** Days from approved layout to delivery, shown to customers. */
    productionDays: z.number().int().positive(),
    formats: z.array(ProductFormat).min(1),
    extras: z.array(ProductExtra).default([]),
    steps: z.array(WizardStep).min(1),
    collaboration: Collaboration,
    b2b: z
      .object({
        priceFrom: Tenge,
        description: z.string().min(1),
      })
      .optional(),
  })
  .superRefine((product, ctx) => {
    for (const format of product.formats) {
      if (format.price < product.deposit) {
        ctx.addIssue({
          code: 'custom',
          path: ['formats', format.id],
          message: 'Format price must be at least the deposit',
        });
      }
    }
    const stepIds = new Set<string>();
    for (const step of product.steps) {
      if (stepIds.has(step.id)) {
        ctx.addIssue({ code: 'custom', path: ['steps', step.id], message: 'Duplicate step id' });
      }
      stepIds.add(step.id);
    }
    if (product.collaboration.enabled && !product.steps.some((s) => s.audience === 'contributor')) {
      ctx.addIssue({
        code: 'custom',
        path: ['collaboration'],
        message: 'Collaboration is enabled but no contributor steps are defined',
      });
    }
  });
export type Product = z.infer<typeof Product>;
export type ProductInput = z.input<typeof Product>;

/** Compact product card for listings. */
export const ProductSummary = z.object({
  id: ProductId,
  name: z.string(),
  domain: z.string(),
  tagline: z.string(),
  deposit: Tenge,
  priceFrom: Tenge,
  priceTo: Tenge,
});
export type ProductSummary = z.infer<typeof ProductSummary>;

export function toProductSummary(p: Product): ProductSummary {
  const prices = p.formats.map((f) => f.price);
  return {
    id: p.id,
    name: p.name,
    domain: p.domain,
    tagline: p.tagline,
    deposit: p.deposit,
    priceFrom: Math.min(...prices),
    priceTo: Math.max(...prices),
  };
}

export function ownerSteps(product: Pick<Product, 'steps'>) {
  return product.steps.filter((s) => s.audience === 'owner');
}

export function contributorSteps(product: Pick<Product, 'steps'>) {
  return product.steps.filter((s) => s.audience === 'contributor');
}

/**
 * The tone of the texts the customer chose (the owner-step choice/select field with role `textTone`),
 * as the option the customer saw: label and description. Undefined when the product has no such
 * question or it was left empty.
 */
export function textToneOf(
  product: Pick<Product, 'steps'>,
  answers: Record<string, Record<string, unknown> | undefined>,
): { label: string; description: string } | undefined {
  for (const step of ownerSteps(product)) {
    for (const field of step.fields) {
      if ((field.type !== 'choice' && field.type !== 'select') || field.role !== 'textTone') continue;
      const raw = answers[step.id]?.[field.id];
      const value = Array.isArray(raw) ? raw[0] : raw;
      const option = field.options.find((o) => o.value === value);
      if (option) return { label: option.label, description: option.description ?? '' };
    }
  }
  return undefined;
}
