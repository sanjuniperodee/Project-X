import { z } from 'zod';

/**
 * AI-assembled content draft. One generic shape for every product:
 *  - glossy:    sections = articles (interview, rules of life, friends' insights), cards = cover lines
 *  - shezhire:  sections = family chronicle chapters, cards = short bios of relatives
 *  - boardgame: sections = rules, cards = the game deck (questions / conflict cards / squares)
 * Designers use it as the starting point for the layout.
 */
export const DraftSection = z.object({
  heading: z.string(),
  body: z.string(),
});

export const DraftCard = z.object({
  title: z.string(),
  text: z.string(),
});

/** Rubrics of a Cover Me issue that the art direction can retitle. */
export const MAGAZINE_RUBRICS = [
  'dossier',
  'interview',
  'tastes',
  'timeline',
  'numbers',
  'thenNow',
  'rules',
  'friends',
  'words',
  'photos',
  'horoscope',
] as const;
export const MagazineRubric = z.enum(MAGAZINE_RUBRICS);
export type MagazineRubric = z.infer<typeof MagazineRubric>;

/**
 * Art direction written by the AI for this one issue: personal rubric titles instead of
 * the generic ones, a line under the masthead, a playful horoscope. Layouts fall back to
 * their own wording for anything empty, so every field is optional.
 */
export const DraftArt = z.object({
  rubrics: z
    .array(z.object({ rubric: z.string(), title: z.string(), deck: z.string() }))
    .default([]),
  tagline: z.string().default(''),
  horoscope: z.string().default(''),
});
export type DraftArt = z.infer<typeof DraftArt>;

export const Draft = z.object({
  title: z.string(),
  lead: z.string(),
  sections: z.array(DraftSection),
  cards: z.array(DraftCard),
  art: DraftArt.optional(),
  generator: z.string(),
  generatedAt: z.iso.datetime(),
});
export type Draft = z.infer<typeof Draft>;

/** The part of a draft an AI model must produce (metadata is added by the ai service). */
export const DraftContent = Draft.omit({ generator: true, generatedAt: true });
export type DraftContent = z.infer<typeof DraftContent>;
