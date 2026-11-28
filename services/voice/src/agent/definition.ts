import type { VoiceToolName } from '@px/contracts';

/**
 * The ElevenLabs agent as code. `npm run provision` creates or updates the agent and its
 * client tools from this file, so the prompt, the voice and the tools are reviewed and
 * versioned here, not edited by hand in the ElevenLabs dashboard.
 *
 * The prompt is a shell: everything about one conversation (mode, rules, the questionnaire,
 * what is already known) arrives in the `{{placeholders}}` (see context.ts).
 */
export const AGENT_NAME = 'Project X — голосовой редактор';

export const AGENT_PROMPT = `Вы — голос редакции студии персональных подарков: главный редактор проекта «{{product_name}}». Вы разговариваете с заказчиком вслух и собираете материал для его заказа.

Собеседник: {{customer_name}}. Заказ: «{{subject}}».

Как вы говорите:
- По-русски, на «вы», тепло и с живым интересом, как редактор, который любит своих героев.
- Коротко: одна-две фразы и один вопрос за раз. Это разговор, а не анкета.
- Только то, что естественно произнести вслух: без списков, скобок, эмодзи, кавычек-ёлочек и слов «поле», «инструмент», «сохраняю».
- На интересный ответ реагируйте одной живой фразой и идите дальше. Не пересказывайте человеку его же слова.
- Казахские имена и слова произносите и записывайте как есть.

Как вы работаете:
- Всё услышанное сразу записывайте инструментами, молча, не спрашивая разрешения.
- Ничего не выдумывайте и не дописывайте за человека.
- Если человек отвлёкся или спросил о цене, сроках и оплате: срок изготовления и суммы видны на экране заказа, а вы вернитесь к разговору.
- Если просят то, чего вы не можете (поменять формат, отменить заказ), предложите написать студии в WhatsApp.

{{brief}}`;

export const AGENT_FIRST_MESSAGE = '{{first_message}}';

/** Sample values so the agent can be tried in the ElevenLabs dashboard. */
export const AGENT_PLACEHOLDERS = {
  product_name: 'Cover Me',
  customer_name: 'Динара',
  subject: 'Айгерим',
  first_message: 'Здравствуйте, Динара! Я редактор Cover Me. Начнём?',
  brief: 'Режим: интервью. Спросите имя героя и сохраните его: save_answer, field "hero.heroName".',
};

interface ToolParameter {
  type: 'string' | 'integer';
  description: string;
  required?: boolean;
}

export interface ClientToolDefinition {
  name: VoiceToolName;
  description: string;
  parameters: Record<string, ToolParameter>;
}

/** Client tools: the browser runs them (see the frontend's voice studio) and answers with a short text. */
export const AGENT_TOOLS: ClientToolDefinition[] = [
  {
    name: 'save_answer',
    description: 'Сохранить ответ в обычное поле анкеты (не список и не фото). Вызывайте сразу, как услышали ответ. Повторный вызов заменяет значение.',
    parameters: {
      field: { type: 'string', description: 'Путь поля из анкеты, например hero.heroName', required: true },
      value: { type: 'string', description: 'Значение. Для выбора — код варианта; для даты — ГГГГ-ММ-ДД; для текста — слова человека', required: true },
    },
  },
  {
    name: 'append_answer',
    description: 'Дописать текст к тому, что уже есть в текстовом поле (новым абзацем): дополнения к рассказу и то, что человек добавил от себя.',
    parameters: {
      field: { type: 'string', description: 'Путь текстового поля', required: true },
      text: { type: 'string', description: 'Что дописать', required: true },
    },
  },
  {
    name: 'add_list_item',
    description: 'Добавить одну запись в поле-список (события, факты, правила, люди). Одна запись — один вызов.',
    parameters: {
      list: { type: 'string', description: 'Путь списка, например timeline.events', required: true },
      item: { type: 'string', description: 'Запись как JSON-объект строкой; ключи — поля записи из анкеты. Пример: {"year":"2014","title":"Переехала в Алматы"}', required: true },
    },
  },
  {
    name: 'remove_list_item',
    description: 'Убрать запись из списка, если человек передумал или оговорился.',
    parameters: {
      list: { type: 'string', description: 'Путь списка', required: true },
      index: { type: 'integer', description: 'Номер записи, с единицы. Без номера убирается последняя' },
    },
  },
  {
    name: 'request_photos',
    description: 'Открыть у человека на экране окно для загрузки фотографий в поле с фото. Не ждёт загрузки: о добавленных фото сообщат отдельно.',
    parameters: { field: { type: 'string', description: 'Путь поля с фото, например photos.cover', required: true } },
  },
  {
    name: 'get_status',
    description: 'Узнать, что уже заполнено и чего не хватает. Полезно после паузы или перед завершением.',
    parameters: {},
  },
  {
    name: 'finish_interview',
    description: 'Завершить интервью, когда всё обязательное собрано и человеку нечего добавить. Вернёт список недостающего, если завершать рано.',
    parameters: {},
  },
  {
    name: 'show_page',
    description: 'Режим правок: пролистать макет на экране человека к странице.',
    parameters: { page: { type: 'integer', description: 'Номер страницы', required: true } },
  },
  {
    name: 'request_changes',
    description: 'Режим правок: отправить согласованные с человеком правки макета в редакцию. Один вызов со всеми правками.',
    parameters: { comment: { type: 'string', description: 'Все правки понятным редактору текстом, с номерами страниц', required: true } },
  },
];

export interface AgentOptions {
  voiceId: string;
  llm: string;
  toolIds: string[];
}

/** `tool_config` of `POST /v1/convai/tools`. */
export function toolConfig(tool: ClientToolDefinition) {
  const entries = Object.entries(tool.parameters);
  return {
    type: 'client' as const,
    name: tool.name,
    description: tool.description,
    // The agent waits for the page's answer (saved / what is wrong) before it goes on.
    expects_response: true,
    response_timeout_secs: 20,
    parameters: {
      type: 'object' as const,
      properties: Object.fromEntries(entries.map(([key, p]) => [key, { type: p.type, description: p.description }])),
      required: entries.filter(([, p]) => p.required).map(([key]) => key),
    },
  };
}

/** Body of `POST /v1/convai/agents/create` and `PATCH /v1/convai/agents/:id`. */
export function agentConfig(options: AgentOptions) {
  return {
    name: AGENT_NAME,
    conversation_config: {
      agent: {
        first_message: AGENT_FIRST_MESSAGE,
        language: 'ru',
        dynamic_variables: { dynamic_variable_placeholders: AGENT_PLACEHOLDERS },
        prompt: {
          prompt: AGENT_PROMPT,
          llm: options.llm,
          temperature: 0.3,
          tool_ids: options.toolIds,
          ignore_default_personality: true,
          timezone: 'Asia/Almaty',
        },
      },
      // The platform's default speech model is kept: it is the current multilingual one.
      tts: { voice_id: options.voiceId },
      // A full interview with photos takes 10–20 minutes. Transcripts and tool calls reach the page by default.
      conversation: { max_duration_seconds: 1800 },
    },
    // Private agent: conversations start only with a token this service issues.
    platform_settings: { auth: { enable_auth: true } },
  };
}
