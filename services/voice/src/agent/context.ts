import { describeInterview, interviewProgress, type Product, type ProjectView } from '@px/contracts';

/**
 * What the agent is told about one conversation: the values of the `{{placeholders}}` in its
 * prompt and first message (see definition.ts). The rules of each mode live here, next to the
 * data they refer to, so the agent stored at ElevenLabs stays a thin shell.
 */
export type AgentVariables = Record<'product_name' | 'customer_name' | 'subject' | 'brief' | 'first_message', string>;

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

export function interviewVariables(product: Product, project: ProjectView): AgentVariables {
  const progress = interviewProgress(product, project.answers);
  const name = firstName(project.customer.name);
  const fresh = progress.answered === 0;
  return {
    product_name: product.name,
    customer_name: project.customer.name,
    subject: project.subject,
    first_message: fresh
      ? `Здравствуйте, ${name}! Я редактор ${product.name}. Соберём всё про «${project.subject}» за один разговор: я спрашиваю, вы рассказываете как подруге. Фотографии можно перетаскивать на экран в любой момент. Начнём?`
      : `С возвращением, ${name}! Часть ответов у меня уже записана. Продолжим с того места, где остановились?`,
    brief: `Режим: интервью. За один разговор соберите ответы на вопросы анкеты и сохраните их инструментами.

Правила интервью:
- Идите по разделам по порядку. Если человек сам рассказал что-то из другого раздела, сохраните это туда и не переспрашивайте.
- Поля с пометкой [обязательно] нужны точно. Остальные тоже спросите, но если человек не знает или не хочет — идите дальше.
- Не читайте названия полей: спрашивайте по-человечески, по одному вопросу. Когда нужен выбор из вариантов, назовите варианты своими словами.
- Рассказы сохраняйте близко к словам человека, ничего не добавляя от себя. В короткие поля записывайте короткую формулировку.
- Каждый услышанный факт сохраняйте сразу, тем же ходом: save_answer для обычного поля, add_list_item для записи списка (item — JSON-объект строкой, ключи — поля записи).
- Если человек дополняет уже записанный рассказ или хочет добавить что-то от себя — append_answer в самое подходящее поле.
- Даты сохраняйте как ГГГГ-ММ-ДД. Не хватает года или дня — уточните.
- Дойдя до поля с фотографиями, вызовите request_photos и скажите, что на экране открылось окно для фото. Ждать не нужно: продолжайте разговор, о добавленных фото вам сообщат.
- Инструмент ответил ошибкой — исправьте значение или переспросите человека, вслух про ошибку не говорите.
- Уже заполненное не переспрашивайте. Если человек поправляет прошлый ответ — сохраните новый.
- Когда обязательное собрано и добавить больше нечего: одной фразой подведите итог и вызовите finish_interview. Если он вернёт, чего не хватает, — доспросите это.

Заполнено ${progress.answered} из ${progress.total}.${progress.missing.length ? ` Обязательного не хватает: ${progress.missing.map((f) => f.path).join(', ')}.` : ''}

Анкета (путь поля — как его передавать в инструменты) и что уже известно:
${describeInterview(product, project.answers)}`,
  };
}

const PAGE_KINDS: Record<string, string> = {
  cover: 'обложка', contents: 'содержание', letter: 'письмо редактора', dossier: 'досье', article: 'статья', tastes: 'вкусы',
  timeline: 'хронология', numbers: 'в цифрах', horoscope: 'гороскоп', 'then-now': 'тогда и сейчас', rules: 'правила жизни',
  friends: 'друзья', words: 'одним словом', photos: 'фото', quote: 'цитата', wishes: 'пожелания', back: 'задняя обложка',
};

export function editVariables(product: Product, project: ProjectView): AgentVariables {
  const layout = project.layout!;
  const name = firstName(project.customer.name);
  const left = Math.max(0, project.design.revisionsLimit - project.design.revisionsUsed);
  const pages = layout.pages.map((p) => `${p.number} — ${PAGE_KINDS[p.kind] ?? p.kind}`).join('; ');
  const draft = project.draft;
  const texts = draft
    ? [`Заголовок: ${draft.title}`, `Вступление: ${cut(draft.lead, 400)}`, ...draft.sections.map((s) => `«${s.heading}»: ${cut(s.body, 500)}`), draft.cards.length ? `Выносы: ${draft.cards.map((c) => c.title).join('; ')}` : '']
        .filter(Boolean)
        .join('\n')
    : 'Тексты недоступны.';
  return {
    product_name: product.name,
    customer_name: project.customer.name,
    subject: project.subject,
    first_message: `${name}, макет готов — он у вас на экране, ${layout.pages.length} страниц. Полистайте и скажите, что хочется поменять.`,
    brief: `Режим: правки макета. Макет версии ${layout.version} открыт у человека на экране. Ваша задача — понять, что поменять, и передать правки редакции.

Правила:
- Когда человек говорит о странице или рубрике, вызовите show_page с её номером, чтобы макет пролистался туда.
- Уточняйте правки до конкретики: что именно, на какой странице, на что заменить.
- Когда правки понятны, перескажите их одной-двумя фразами. После согласия вызовите request_changes: в comment — полный список правок понятным редактору текстом, с номерами страниц.
- После request_changes скажите, что новая версия появится через пару минут, и попрощайтесь.
- Если всё нравится, правки не нужны: предложите нажать «Согласовать» на экране.
- Фото и ответы анкеты в этом режиме не меняются: если нужно заменить фото, запишите это в правки словами.
- Автоматических кругов правок осталось: ${left}.${left === 0 ? ' Следующие правки внесёт дизайнер студии вручную, это дольше — предупредите.' : ''}

Страницы макета: ${pages}.

Тексты номера:
${texts}`,
  };
}

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
