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

export const Draft = z.object({
  title: z.string(),
  lead: z.string(),
  sections: z.array(DraftSection),
  cards: z.array(DraftCard),
  generator: z.string(),
  generatedAt: z.iso.datetime(),
});
export type Draft = z.infer<typeof Draft>;

/** The part of a draft an AI model must produce (metadata is added by the ai service). */
export const DraftContent = Draft.omit({ generator: true, generatedAt: true });
export type DraftContent = z.infer<typeof DraftContent>;
