import type { Answers, LeafField } from './fields';
import { addListItem, interviewFields, isAnswered, setAnswer, type InterviewField, type StepChange } from './interview';
import type { Product } from './products';

/**
 * The interview without a language model: walks the questionnaire in order, asks every field
 * by its label and takes the reply as the answer. It is the fallback of the voice mode (no
 * ElevenLabs agent configured, or the connection failed) and what the tests drive.
 */
export interface ScriptState {
  /** Fields the person skipped or finished (lists), by path. */
  skipped: string[];
}

export type ScriptExpectation =
  | { kind: 'answer'; field: InterviewField }
  | { kind: 'list'; field: InterviewField }
  | { kind: 'photos'; field: InterviewField }
  | { kind: 'done' };

export interface ScriptTurn {
  say: string;
  expect: ScriptExpectation;
}

type ProductSteps = Pick<Product, 'steps'>;

const SKIP = /^(пропус|дальше|не знаю|не помню|следующ|потом|позже)/i;
const DONE = /^(готово|вс[её]\b|это вс[её]|хватит|достаточно|дальше|законч|больше нет|следующ)/i;

export const initialScriptState = (): ScriptState => ({ skipped: [] });

/** What to ask now. */
export function scriptQuestion(product: ProductSteps, answers: Answers, state: ScriptState): ScriptTurn {
  const field = interviewFields(product).find((f) => !state.skipped.includes(f.path) && !isAnswered(f.field, answers[f.step.id]?.[f.field.id]) || isOpenList(f, state));
  if (!field) return { say: 'Это были все вопросы. Собираю номер?', expect: { kind: 'done' } };
  const { field: f } = field;
  const hint = f.hint ? ` ${f.hint}` : '';
  switch (f.type) {
    case 'photos':
      return { say: `Добавьте фотографии: ${lower(f.label)}.${hint} Скажите «дальше», когда закончите.`, expect: { kind: 'photos', field } };
    case 'list': {
      const parts = f.fields.filter((sub) => sub.type !== 'photos').map((sub) => lower(sub.label));
      return {
        say: `${field.step.title}. Называйте по одному: ${parts.join(', ')}. Скажите «готово», когда закончите.`,
        expect: { kind: 'list', field },
      };
    }
    case 'select':
    case 'choice':
      return { say: `${f.label}? Варианты: ${f.options.map((o) => o.label).join(', ')}.`, expect: { kind: 'answer', field } };
    default:
      return { say: `${f.label}?${hint}`, expect: { kind: 'answer', field } };
  }
}

/** A list stays the current question until the person says they are done with it. */
function isOpenList(field: InterviewField, state: ScriptState): boolean {
  return field.field.type === 'list' && !state.skipped.includes(field.path);
}

export interface ScriptReply {
  changes: StepChange[];
  state: ScriptState;
  /** Said before the next question (a confirmation or what went wrong). */
  say: string;
}

/** Takes the reply to the question `scriptQuestion` returned. */
export function scriptAnswer(product: ProductSteps, answers: Answers, state: ScriptState, expect: ScriptExpectation, utterance: string): ScriptReply {
  const said = utterance.trim();
  const skip = (path: string): ScriptState => ({ skipped: [...state.skipped, path] });
  if (expect.kind === 'done' || !said) return { changes: [], state, say: '' };
  const { field } = expect;

  if (expect.kind === 'photos') return { changes: [], state: skip(field.path), say: '' };

  if (expect.kind === 'list') {
    if (DONE.test(said) || SKIP.test(said)) return { changes: [], state: skip(field.path), say: '' };
    if (field.field.type !== 'list') return { changes: [], state, say: '' };
    const result = addListItem(product, answers, field.path, splitItem(field.field.fields, said));
    return result.ok
      ? { changes: [result.data], state, say: 'Записала. Ещё?' }
      : { changes: [], state, say: result.message };
  }

  if (SKIP.test(said)) {
    return field.field.required
      ? { changes: [], state, say: 'Без этого ответа номер не собрать.' }
      : { changes: [], state: skip(field.path), say: 'Хорошо, пропустим.' };
  }
  const result = setAnswer(product, answers, field.path, said);
  return result.ok ? { changes: [result.data], state, say: '' } : { changes: [], state, say: result.message };
}

/** «2014, переехала в Алматы» → { year: '2014', title: 'переехала в Алматы' }: the first separator splits two-field records. */
function splitItem(fields: LeafField[], said: string): Record<string, string> {
  const spoken = fields.filter((f) => f.type !== 'photos');
  if (spoken.length <= 1) return { [spoken[0]!.id]: said };
  const match = /^(.+?)\s*(?:[,;:—–]|\s-\s)\s*(.+)$/.exec(said) ?? /^(\S+)\s+(.+)$/.exec(said);
  if (!match) return { [spoken[0]!.id]: said };
  return { [spoken[0]!.id]: match[1]!.trim(), [spoken[1]!.id]: match[2]!.trim() };
}

const lower = (text: string) => text.charAt(0).toLocaleLowerCase('ru-RU') + text.slice(1);
