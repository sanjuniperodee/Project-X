import { z } from 'zod';

/**
 * Print layouts assembled automatically by the layout service.
 *
 *   ai.draft_generated ──▶ layout ──layout.generated──▶ projects: in_design → awaiting_approval
 *                                                                   │
 *        customer: «Согласовать» (then pays the balance) ◀──────────┤
 *        customer: «Нужны правки» ──▶ projects.revision_requested ──▶ ai ──▶ layout (next version)
 *
 * After `revisionsLimit` automatic rounds the project is handed to a human designer
 * (`design.mode = 'studio'`, event `projects.design_handoff`).
 */

/** One printed page (or card sheet / game board) with its preview image. */
export const LayoutPage = z.object({
  number: z.number().int().positive(),
  /** What is on the page: cover, article, friends, photos, tree, chapter, cards, board… */
  kind: z.string().min(1),
  /** Trimmed size; boards and card sheets differ from the book pages. */
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  /** Self-contained SVG (text as outlines, photos as small embedded thumbnails). */
  previewUrl: z.string().min(1),
});
export type LayoutPage = z.infer<typeof LayoutPage>;

export const LayoutStatus = z.enum([
  /** Shown to the customer, waiting for a decision. */
  'pending',
  'approved',
  'changes_requested',
  /** Arrived when the project no longer waited for it (e.g. handed to the studio). */
  'discarded',
]);
export type LayoutStatus = z.infer<typeof LayoutStatus>;

export const LAYOUT_STATUS_LABELS: Readonly<Record<LayoutStatus, string>> = {
  pending: 'Ждёт согласования',
  approved: 'Согласован',
  changes_requested: 'Нужны правки',
  discarded: 'Не показан клиенту',
};

/** Who designs the project right now: the automatic pipeline or a person in the studio. */
export const DesignMode = z.enum(['auto', 'studio']);
export type DesignMode = z.infer<typeof DesignMode>;

export const DesignState = z.object({
  mode: DesignMode,
  /** Automatic revision rounds already used. */
  revisionsUsed: z.number().int().nonnegative(),
  revisionsLimit: z.number().int().nonnegative(),
});
export type DesignState = z.infer<typeof DesignState>;

export const LayoutView = z.object({
  version: z.number().int().positive(),
  status: LayoutStatus,
  pdfUrl: z.string().min(1),
  pages: z.array(LayoutPage),
  template: z.string(),
  /** Notes for the studio (skipped photos, overflowing text…). Not shown to customers. */
  warnings: z.array(z.string()),
  /** The customer's change request for this version. */
  feedback: z.string().nullable(),
  createdAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().nullable(),
});
export type LayoutView = z.infer<typeof LayoutView>;

// ---------- Customer decisions ----------

/** The version is sent back so a decision never lands on a layout the customer has not seen. */
export const ApproveLayoutRequest = z.object({
  version: z.number().int().positive(),
});
export type ApproveLayoutRequest = z.infer<typeof ApproveLayoutRequest>;

export const RequestLayoutChangesRequest = z.object({
  /** Required while an automatic layout waits for a decision; absent when the studio made the layout. */
  version: z.number().int().positive().optional(),
  comment: z
    .string()
    .trim()
    .min(5, 'Опишите, что поправить: страницу, текст или фото')
    .max(2000, 'Слишком длинный комментарий — сократите до 2000 символов'),
});
export type RequestLayoutChangesRequest = z.infer<typeof RequestLayoutChangesRequest>;

/**
 * Preview of the issue before the materials go to the editors: the same templates over the current answers,
 * with a draft made from the answers (no model). Only page previews, no print PDF.
 */
export const ProjectPreview = z.object({
  pages: z.array(LayoutPage),
  warnings: z.array(z.string()),
  generatedAt: z.iso.datetime(),
});
export type ProjectPreview = z.infer<typeof ProjectPreview>;
