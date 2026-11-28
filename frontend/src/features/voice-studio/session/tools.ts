import {
  addListItem,
  appendAnswer,
  interviewProgress,
  removeListItem,
  setAnswer,
  VOICE_TOOLS,
  type InterviewResult,
  type StepChange,
  type VoiceToolName,
} from '@px/contracts';
import type { StudioStore } from './types';

export type ToolHandlers = Record<VoiceToolName, (parameters: unknown) => Promise<string>>;

/**
 * The agent's tools, run in the browser. Every call is validated like a form submission and
 * answered with a short text the model reads: what was saved, or what is wrong so it can fix it.
 * Calls run one after another, so two answers to the same step never overwrite each other.
 */
export function createToolHandlers(store: StudioStore): ToolHandlers {
  const save = async (result: InterviewResult<StepChange>): Promise<string> => {
    if (!result.ok) return result.message;
    await store.apply(result.data);
    return result.message;
  };

  const tool = <N extends VoiceToolName>(name: N, run: (input: ReturnType<(typeof VOICE_TOOLS)[N]['parse']>) => Promise<string> | string) => {
    return (parameters: unknown) =>
      store.exclusive(async () => {
        const parsed = VOICE_TOOLS[name].safeParse(parameters ?? {});
        if (!parsed.success) return `Неверные параметры ${name}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`;
        try {
          return await run(parsed.data as never);
        } catch (error) {
          return `Не получилось: ${error instanceof Error ? error.message : 'ошибка сети'}. Попробуйте ещё раз.`;
        }
      });
  };

  const answers = () => store.project().answers;
  const interviewOnly = () => (store.mode === 'interview' ? null : 'Сейчас режим правок макета: анкета не меняется.');

  return {
    save_answer: tool('save_answer', ({ field, value }) => interviewOnly() ?? save(setAnswer(store.product, answers(), field, value))),
    append_answer: tool('append_answer', ({ field, text }) => interviewOnly() ?? save(appendAnswer(store.product, answers(), field, text))),
    add_list_item: tool('add_list_item', ({ list, item }) => {
      const blocked = interviewOnly();
      if (blocked) return blocked;
      let values: unknown;
      try {
        values = JSON.parse(item);
      } catch {
        return 'item должен быть JSON-объектом строкой, например {"year":"2014","title":"Переехала в Алматы"}.';
      }
      if (!values || typeof values !== 'object' || Array.isArray(values)) return 'item должен быть JSON-объектом: ключи — поля записи.';
      return save(addListItem(store.product, answers(), list, values as Record<string, unknown>));
    }),
    remove_list_item: tool('remove_list_item', ({ list, index }) => interviewOnly() ?? save(removeListItem(store.product, answers(), list, index))),
    request_photos: tool('request_photos', ({ field }) => interviewOnly() ?? store.requestPhotos(field).message),
    get_status: tool('get_status', () => {
      const progress = interviewProgress(store.product, answers());
      const names = (fields: typeof progress.missing) => fields.map((f) => `${f.path} («${f.field.label}»)`).join(', ');
      return [
        `Заполнено ${progress.answered} из ${progress.total}.`,
        progress.missing.length ? `Обязательного не хватает: ${names(progress.missing)}.` : 'Всё обязательное собрано.',
        progress.open.length ? `Ещё не спрашивали: ${names(progress.open)}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
    }),
    finish_interview: tool('finish_interview', () => interviewOnly() ?? store.finish().message),
    show_page: tool('show_page', ({ page }) => store.showPage(page).message),
    request_changes: tool('request_changes', async ({ comment }) => (await store.requestChanges(comment)).message),
  };
}
