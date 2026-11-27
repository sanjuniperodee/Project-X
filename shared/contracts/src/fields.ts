import { z } from 'zod';

/**
 * Schema-driven form fields.
 *
 * Every product describes its questionnaire as data (see catalog service).
 * The same definition renders the form on the frontend and validates
 * answers in the projects service — one source of truth, no drift.
 */

const Id = z.string().regex(/^[a-z][a-zA-Z0-9_]*$/, 'Field ids are camelCase identifiers');

const FieldBase = z.object({
  id: Id,
  label: z.string().min(1),
  hint: z.string().optional(),
  required: z.boolean().default(false),
});

const Option = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});
export type FieldOption = z.infer<typeof Option>;

export const TextField = FieldBase.extend({
  type: z.literal('text'),
  placeholder: z.string().optional(),
  maxLength: z.number().int().positive().default(200),
});

export const TextareaField = FieldBase.extend({
  type: z.literal('textarea'),
  placeholder: z.string().optional(),
  maxLength: z.number().int().positive().default(4000),
  rows: z.number().int().positive().default(5),
});

export const DateField = FieldBase.extend({
  type: z.literal('date'),
  /**
   * `eventDate`: the date the gift is for (birthday, wedding…). The studio plans production
   * around it: it becomes the project's deadline in the back office.
   */
  role: z.enum(['eventDate']).optional(),
});

export const SelectField = FieldBase.extend({
  type: z.literal('select'),
  options: z.array(Option).min(1),
});

export const ChoiceField = FieldBase.extend({
  type: z.literal('choice'),
  options: z.array(Option).min(1),
  multiple: z.boolean().default(false),
});

export const PhotosField = FieldBase.extend({
  type: z.literal('photos'),
  min: z.number().int().nonnegative().default(0),
  max: z.number().int().positive().default(20),
});

/** Fields that may appear inside a repeatable list item. */
export const LeafField = z.discriminatedUnion('type', [
  TextField,
  TextareaField,
  DateField,
  SelectField,
  ChoiceField,
  PhotosField,
]);
export type LeafField = z.infer<typeof LeafField>;
export type LeafFieldInput = z.input<typeof LeafField>;

export const ListField = FieldBase.extend({
  type: z.literal('list'),
  itemLabel: z.string().min(1),
  addLabel: z.string().min(1),
  fields: z.array(LeafField).min(1),
  min: z.number().int().nonnegative().default(0),
  max: z.number().int().positive().default(50),
});

export const Field = z.discriminatedUnion('type', [
  TextField,
  TextareaField,
  DateField,
  SelectField,
  ChoiceField,
  PhotosField,
  ListField,
]);
export type Field = z.infer<typeof Field>;
export type FieldInput = z.input<typeof Field>;
export type FieldType = Field['type'];
export type ListField = z.infer<typeof ListField>;

/** Who fills a step: the person ordering, invited friends/relatives/colleagues, or both. */
export const StepAudience = z.enum(['owner', 'contributor']);
export type StepAudience = z.infer<typeof StepAudience>;

export const WizardStep = z.object({
  id: Id,
  title: z.string().min(1),
  description: z.string().optional(),
  audience: StepAudience,
  fields: z.array(Field).min(1),
});
export type WizardStep = z.infer<typeof WizardStep>;
export type WizardStepInput = z.input<typeof WizardStep>;

/** Uploaded media reference, as returned by the media service. */
export const MediaRef = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
});
export type MediaRef = z.infer<typeof MediaRef>;

/** Answers for one step: field id -> value. */
export const StepAnswers = z.record(z.string(), z.unknown());
export type StepAnswers = z.infer<typeof StepAnswers>;

/** Answers for a whole questionnaire: step id -> step answers. */
export const Answers = z.record(z.string(), StepAnswers);
export type Answers = z.infer<typeof Answers>;
