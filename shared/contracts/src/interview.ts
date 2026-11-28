import type { Answers, Field, LeafField, ListField, StepAnswers, WizardStep } from './fields';
import { ownerSteps, type Product } from './products';
import { validateStep } from './validation';

/**
 * The questionnaire as a conversation. The voice assistant (an ElevenLabs agent or the
 * scripted fallback in the browser) fills the same answers the forms fill, through a small
 * set of operations defined here: pure functions over the product's steps, so the rules for
 * what can be said into which field live in one place and are validated like the forms.
 *
 * Fields are addressed by path: "hero.heroName" (step id, field id).
 */
export interface InterviewField {
  /** "step.field" */
  path: string;
  step: Pick<WizardStep, 'id' | 'title' | 'description'>;
  field: Field;
}

export type InterviewResult<T = unknown> = { ok: true; message: string; data: T } | { ok: false; message: string };

/** One saved step, ready for `PUT /projects/:editKey/steps/:stepId`. */
export interface StepChange {
  stepId: string;
  answers: StepAnswers;
  /** What changed, for the screen: «Имя героя на обложке — Айгерим». */
  label: string;
  value: string;
}

type ProductSteps = Pick<Product, 'steps'>;

export function interviewFields(product: ProductSteps): InterviewField[] {
  return ownerSteps(product).flatMap((step) =>
    step.fields.map((field) => ({ path: `${step.id}.${field.id}`, step: { id: step.id, title: step.title, description: step.description }, field })),
  );
}

export function findInterviewField(product: ProductSteps, path: string): InterviewField | undefined {
  const wanted = path.trim();
  const fields = interviewFields(product);
  // Models sometimes drop the step: accept a bare field id when it is unambiguous.
  return fields.find((f) => f.path === wanted) ?? only(fields.filter((f) => f.field.id === wanted));
}

const only = <T>(items: T[]): T | undefined => (items.length === 1 ? items[0] : undefined);

export function isAnswered(field: Field, value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'string' ? value.trim() !== '' : value != null;
}

/** Turns what was said (or what a model extracted) into the value a leaf field stores. */
export function parseSpokenValue(field: LeafField, raw: string): InterviewResult<unknown> {
  const text = raw.trim();
  switch (field.type) {
    case 'text':
    case 'textarea':
      if (text.length > field.maxLength) {
        return { ok: false, message: `Слишком длинно для «${field.label}»: ${text.length} символов, нужно не больше ${field.maxLength}. Сократи.` };
      }
      return { ok: true, message: 'ok', data: text };
    case 'date': {
      const iso = toIsoDate(text);
      return iso
        ? { ok: true, message: 'ok', data: iso }
        : { ok: false, message: `«${field.label}» — дата в формате ГГГГ-ММ-ДД, например 2026-12-12. Уточни день, месяц и год.` };
    }
    case 'select':
    case 'choice': {
      const multiple = field.type === 'choice' && field.multiple;
      const wanted = multiple ? text.split(/[,;]/).map((part) => part.trim()).filter(Boolean) : [text];
      const values: string[] = [];
      for (const part of wanted) {
        const option = matchOption(field.options, part);
        if (!option) {
          return { ok: false, message: `Для «${field.label}» подходят только варианты: ${field.options.map((o) => `${o.value} (${o.label})`).join(', ')}.` };
        }
        values.push(option.value);
      }
      return { ok: true, message: 'ok', data: multiple ? values : values[0] };
    }
    case 'photos':
      return { ok: false, message: `«${field.label}» — это фотографии, их добавляют через request_photos.` };
  }
}

function matchOption<T extends { value: string; label: string }>(options: T[], said: string): T | undefined {
  const norm = (value: string) => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[«»"'.!]/g, '').trim();
  const wanted = norm(said);
  if (!wanted) return undefined;
  return (
    options.find((o) => norm(o.value) === wanted || norm(o.label) === wanted) ??
    only(options.filter((o) => norm(o.label).startsWith(wanted) || wanted.startsWith(norm(o.label)))) ??
    only(options.filter((o) => norm(o.label).includes(wanted) || wanted.includes(norm(o.label))))
  );
}

const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];

/** "2026-12-12", "12.12.2026" or «12 декабря 2026» → ISO date; null when it is not a full date. */
export function toIsoDate(text: string): string | null {
  const value = text.trim().toLocaleLowerCase('ru-RU');
  let y: number;
  let m: number;
  let d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(value))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})\s+([а-яё]+)\s+(\d{4})/.exec(value))) {
    const word = match[2]!;
    // «мая» / «май» share the stem «ма» with «март»: check the longer stems first.
    const index = MONTHS.map((stem, i) => ({ stem, i }))
      .sort((a, b) => b.stem.length - a.stem.length)
      .find(({ stem }) => word.startsWith(stem))?.i;
    if (index === undefined) return null;
    [d, m, y] = [Number(match[1]), index + 1, Number(match[3])];
  } else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Saves a scalar answer. Returns the step to store. */
export function setAnswer(product: ProductSteps, answers: Answers, path: string, raw: string): InterviewResult<StepChange> {
  const target = findInterviewField(product, path);
  if (!target) return unknownField(product, path);
  const { field, step } = target;
  if (field.type === 'list') return { ok: false, message: `«${field.label}» — список: добавляй записи через add_list_item (list: "${target.path}").` };
  const parsed = parseSpokenValue(field, raw);
  if (!parsed.ok) return parsed;
  return store(product, answers, step.id, { [field.id]: parsed.data }, field.label, display(field, parsed.data));
}

/** Adds text to what a text field already holds (a new paragraph), for things said in passing. */
export function appendAnswer(product: ProductSteps, answers: Answers, path: string, raw: string): InterviewResult<StepChange> {
  const target = findInterviewField(product, path);
  if (!target) return unknownField(product, path);
  if (target.field.type !== 'textarea' && target.field.type !== 'text') return setAnswer(product, answers, path, raw);
  const current = answers[target.step.id]?.[target.field.id];
  const joined = [typeof current === 'string' ? current.trim() : '', raw.trim()].filter(Boolean).join('\n');
  return setAnswer(product, answers, target.path, joined);
}

/** Adds one record to a list field; `values` are the record's fields by id. */
export function addListItem(product: ProductSteps, answers: Answers, path: string, values: Record<string, unknown>): InterviewResult<StepChange> {
  const target = findInterviewField(product, path);
  if (!target) return unknownField(product, path);
  const { field, step } = target;
  if (field.type !== 'list') return { ok: false, message: `«${field.label}» — не список: сохраняй через save_answer.` };
  const current = listOf(answers, step.id, field.id);
  if (current.length >= field.max) return { ok: false, message: `В «${field.label}» уже ${field.max} записей, больше не помещается.` };

  const spoken = field.fields.filter((f) => f.type !== 'photos');
  const unknown = Object.keys(values).filter((key) => !spoken.some((f) => f.id === key));
  if (unknown.length > 0) return { ok: false, message: `В записи «${field.itemLabel}» нет полей ${unknown.join(', ')}. Есть: ${spoken.map((f) => f.id).join(', ')}.` };

  const item: Record<string, unknown> = {};
  for (const sub of spoken) {
    const raw = values[sub.id];
    if (raw == null || String(raw).trim() === '') {
      if (sub.required) return { ok: false, message: `В записи «${field.itemLabel}» не хватает «${sub.label}» (${sub.id}).` };
      continue;
    }
    const parsed = parseSpokenValue(sub, String(raw));
    if (!parsed.ok) return parsed;
    item[sub.id] = parsed.data;
  }
  const summary = spoken.map((f) => (item[f.id] == null ? '' : display(f, item[f.id]))).filter(Boolean).join(' — ');
  return store(product, answers, step.id, { [field.id]: [...current, item] }, field.label, summary);
}

/** Removes a record from a list: 1-based `index`, or the last one. */
export function removeListItem(product: ProductSteps, answers: Answers, path: string, index?: number): InterviewResult<StepChange> {
  const target = findInterviewField(product, path);
  if (!target) return unknownField(product, path);
  if (target.field.type !== 'list') return { ok: false, message: `«${target.field.label}» — не список.` };
  const current = listOf(answers, target.step.id, target.field.id);
  const at = index === undefined ? current.length - 1 : index - 1;
  if (at < 0 || at >= current.length) return { ok: false, message: `В «${target.field.label}» ${current.length} записей, записи №${index ?? 0} нет.` };
  return store(product, answers, target.step.id, { [target.field.id]: current.filter((_, i) => i !== at) }, target.field.label, 'запись убрана');
}

function store(product: ProductSteps, answers: Answers, stepId: string, patch: StepAnswers, label: string, value: string): InterviewResult<StepChange> {
  const step = ownerSteps(product).find((s) => s.id === stepId)!;
  const result = validateStep(step, { ...answers[stepId], ...patch }, 'draft');
  if (!result.ok) return { ok: false, message: Object.values(result.errors)[0] ?? 'Ответ не подошёл' };
  return { ok: true, message: `Сохранено: ${label}.`, data: { stepId, answers: result.data, label, value } };
}

function unknownField(product: ProductSteps, path: string): InterviewResult<never> {
  return { ok: false, message: `Нет поля «${path}». Есть: ${interviewFields(product).map((f) => f.path).join(', ')}.` };
}

function listOf(answers: Answers, stepId: string, fieldId: string): Array<Record<string, unknown>> {
  const value = answers[stepId]?.[fieldId];
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

/** How a stored value reads to a person. */
export function display(field: LeafField, value: unknown): string {
  if (field.type === 'select' || field.type === 'choice') {
    const values = Array.isArray(value) ? value : [value];
    return values.map((v) => field.options.find((o) => o.value === v)?.label ?? String(v)).join(', ');
  }
  if (field.type === 'photos') return Array.isArray(value) ? `${value.length} фото` : '';
  if (field.type === 'date') return spokenDate(String(value ?? ''));
  return String(value ?? '');
}

const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** "2026-12-12" → «12 декабря 2026». */
function spokenDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${Number(match[3])} ${MONTHS_GENITIVE[Number(match[2]) - 1]} ${match[1]}` : iso;
}

export interface InterviewProgress {
  /** Questions with an answer / all questions. */
  answered: number;
  total: number;
  /** Required questions still empty, in questionnaire order. */
  missing: InterviewField[];
  /** Optional questions still empty. */
  open: InterviewField[];
}

export function interviewProgress(product: ProductSteps, answers: Answers): InterviewProgress {
  const fields = interviewFields(product);
  const empty = fields.filter((f) => !isAnswered(f.field, answers[f.step.id]?.[f.field.id]));
  return {
    answered: fields.length - empty.length,
    total: fields.length,
    missing: empty.filter((f) => f.field.required),
    open: empty.filter((f) => !f.field.required),
  };
}

/**
 * The questionnaire and what is already known, as text for the model that runs the interview:
 * every field with its path, type, limits and current value.
 */
export function describeInterview(product: ProductSteps, answers: Answers): string {
  const lines: string[] = [];
  for (const step of ownerSteps(product)) {
    lines.push(`## ${step.title}${step.description ? ` — ${step.description}` : ''}`);
    for (const field of step.fields) {
      const path = `${step.id}.${field.id}`;
      const value = answers[step.id]?.[field.id];
      lines.push(`- ${path} — «${field.label}»${field.required ? ' [обязательно]' : ''}: ${describeType(field)}${field.hint ? ` Подсказка: ${field.hint}` : ''}`);
      lines.push(`  ${describeValue(field, value)}`);
    }
  }
  return lines.join('\n');
}

function describeType(field: Field): string {
  switch (field.type) {
    case 'text':
      return `короткий текст до ${field.maxLength} символов.`;
    case 'textarea':
      return `свободный рассказ до ${field.maxLength} символов.`;
    case 'date':
      return 'дата, сохранять как ГГГГ-ММ-ДД.';
    case 'select':
    case 'choice':
      return `${field.type === 'choice' && field.multiple ? 'несколько вариантов' : 'один вариант'} из: ${field.options.map((o) => `${o.value} = «${o.label}»${o.description ? ` (${o.description})` : ''}`).join('; ')}.`;
    case 'photos':
      return `фотографии, до ${field.max}. Голосом не заполняется: вызови request_photos.`;
    case 'list':
      return `список до ${field.max} записей «${field.itemLabel}»; поля записи: ${describeListFields(field)}.`;
  }
}

function describeListFields(field: ListField): string {
  return field.fields
    .filter((f) => f.type !== 'photos')
    .map((f) => `${f.id} («${f.label}»${f.required ? ', обязательно' : ''})`)
    .join(', ');
}

function describeValue(field: Field, value: unknown): string {
  if (!isAnswered(field, value)) return 'Сейчас: пусто.';
  if (field.type === 'list') {
    const items = (value as Array<Record<string, unknown>>).map((item, i) => {
      const parts = field.fields.filter((f) => f.type !== 'photos' && item[f.id] != null && item[f.id] !== '').map((f) => display(f, item[f.id]));
      return `${i + 1}) ${parts.join(' — ')}`;
    });
    return `Сейчас ${items.length}: ${items.join('; ')}`;
  }
  const text = display(field, value);
  return `Сейчас: ${text.length > 400 ? `${text.slice(0, 400)}…` : text}`;
}
