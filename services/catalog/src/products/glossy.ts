import type { ProductInput } from '@px/contracts';

/**
 * Cover Me — a personal glossy magazine about one person, a couple or a company.
 * Edit prices, formats and questions here; the frontend and validation follow automatically.
 */
export const glossy: ProductInput = {
  id: 'glossy',
  name: 'Cover Me',
  domain: 'coverme.kz',
  tagline: 'Глянцевый журнал, где герой номера — ваш человек',
  deposit: 10_000,
  productionDays: 7,
  formats: [
    {
      id: 'a4-24',
      name: 'Журнал на 24 страницы',
      description: 'Обложка, большое интервью, правила жизни и фотосессия.',
      price: 25_000,
      specs: ['Формат A4', 'Мелованная бумага 150 г/м²', 'Мягкая глянцевая обложка', 'До 40 фотографий'],
    },
    {
      id: 'a4-36',
      name: 'Журнал на 36 страниц',
      description: 'Всё из 24 страниц плюс рубрика друзей, разворот-постер и хронология.',
      price: 35_000,
      recommended: true,
      specs: ['Формат A4', 'Мелованная бумага 170 г/м²', 'Обложка soft-touch', 'До 70 фотографий', 'Разворот-постер'],
    },
  ],
  extras: [
    {
      id: 'guest-copy',
      name: 'Экземпляр для гостей',
      description: 'Такой же журнал — чтобы гости увезли домой.',
      unitPrice: 6_000,
      maxQuantity: 20,
    },
    {
      id: 'gift-box',
      name: 'Подарочная коробка',
      description: 'Плотная коробка с лентой и открыткой.',
      unitPrice: 3_500,
      maxQuantity: 5,
    },
    {
      id: 'express',
      name: 'Срочное производство',
      description: 'Печать и доставка за 3 дня после согласования макета.',
      unitPrice: 7_000,
      maxQuantity: 1,
    },
  ],
  collaboration: {
    enabled: true,
    contributorNoun: 'друзья',
    inviteTitle: 'Помогите собрать журнал',
    inviteDescription:
      'Вас пригласили в секретную редакцию. Напишите историю или пожелание — они войдут в рубрику «Инсайды от друзей».',
  },
  steps: [
    {
      id: 'hero',
      title: 'Герой номера',
      description: 'С этого начинается обложка.',
      audience: 'owner',
      fields: [
        { id: 'heroName', type: 'text', label: 'Имя героя на обложке', placeholder: 'Айгерим', required: true },
        {
          id: 'occasion',
          type: 'select',
          label: 'Повод',
          required: true,
          options: [
            { value: 'birthday', label: 'День рождения' },
            { value: 'jubilee', label: 'Юбилей' },
            { value: 'wedding', label: 'Свадьба или годовщина' },
            { value: 'corporate', label: 'Юбилей компании' },
            { value: 'just-because', label: 'Без повода' },
          ],
        },
        { id: 'eventDate', type: 'date', label: 'Дата праздника', hint: 'Под неё мы планируем печать.' },
        { id: 'birthday', type: 'date', label: 'День рождения героя', hint: 'Для досье и гороскопа номера. Можно пропустить.' },
        { id: 'profession', type: 'text', label: 'Чем занимается', placeholder: 'Основательница кофейни «Дәм»', maxLength: 120 },
        { id: 'city', type: 'text', label: 'Город', placeholder: 'Алматы', maxLength: 80 },
        {
          id: 'tone',
          type: 'choice',
          label: 'Настроение номера',
          required: true,
          options: [
            { value: 'vogue', label: 'Как Vogue', description: 'Сдержанно, дорого, крупные портреты' },
            { value: 'tabloid', label: 'Как таблоид', description: 'Громкие заголовки, сплетни, ирония' },
            { value: 'tender', label: 'Нежно', description: 'Тёплые слова, много воспоминаний' },
          ],
        },
      ],
    },
    {
      id: 'interview',
      title: 'Большое интервью',
      description: 'Отвечайте как есть — редактор превратит это в текст журнала.',
      audience: 'owner',
      fields: [
        {
          id: 'threeWords',
          type: 'text',
          label: 'Опишите героя тремя словами',
          placeholder: 'Смелая, смешная, упрямая',
          required: true,
        },
        {
          id: 'bestStory',
          type: 'textarea',
          label: 'Самая яркая история с героем',
          hint: 'Где это было, кто был рядом, чем закончилось.',
          required: true,
        },
        { id: 'achievements', type: 'textarea', label: 'Чем герой гордится', rows: 4 },
        { id: 'habits', type: 'textarea', label: 'Привычки, словечки и странности', rows: 4 },
        { id: 'childhood', type: 'textarea', label: 'Каким героем был в детстве', rows: 3 },
        { id: 'lesson', type: 'textarea', label: 'Главное, чему научила жизнь', rows: 3 },
        { id: 'dream', type: 'text', label: 'О чём мечтает', maxLength: 300 },
      ],
    },
    {
      id: 'favorites',
      title: 'Любимое',
      description: 'Короткие ответы для рубрики «Вкусы героя». Пропустите то, чего не знаете.',
      audience: 'owner',
      fields: [
        { id: 'food', type: 'text', label: 'Еда', placeholder: 'Мамин бешбармак', maxLength: 80 },
        { id: 'drink', type: 'text', label: 'Напиток', placeholder: 'Флэт уайт на овсяном', maxLength: 80 },
        { id: 'music', type: 'text', label: 'Музыка', placeholder: 'Ninety One и Земфира', maxLength: 80 },
        { id: 'film', type: 'text', label: 'Фильм или сериал', placeholder: '«Друзья»', maxLength: 80 },
        { id: 'place', type: 'text', label: 'Место', placeholder: 'Кок-Жайляу на рассвете', maxLength: 80 },
        { id: 'phrase', type: 'text', label: 'Фраза, которую все от неё слышат', placeholder: 'Ну давайте уже!', maxLength: 120 },
      ],
    },
    {
      id: 'timeline',
      title: 'Хронология',
      description: 'Главные события жизни героя — от рождения до сегодня. Из них получится разворот-хронология.',
      audience: 'owner',
      fields: [
        {
          id: 'events',
          type: 'list',
          label: 'События',
          itemLabel: 'Событие',
          addLabel: 'Добавить событие',
          max: 14,
          fields: [
            { id: 'year', type: 'text', label: 'Год', placeholder: '2014', required: true, maxLength: 20 },
            { id: 'title', type: 'text', label: 'Что случилось', placeholder: 'Переехала в Алматы с одним чемоданом', required: true, maxLength: 160 },
            { id: 'photo', type: 'photos', label: 'Фото того времени', max: 1 },
          ],
        },
      ],
    },
    {
      id: 'numbers',
      title: 'В цифрах',
      description: 'Факты числом: страны, чашки кофе, годы дружбы. Шутки приветствуются.',
      audience: 'owner',
      fields: [
        {
          id: 'facts',
          type: 'list',
          label: 'Факты',
          itemLabel: 'Факт',
          addLabel: 'Добавить факт',
          max: 8,
          fields: [
            { id: 'value', type: 'text', label: 'Число', placeholder: '17', required: true, maxLength: 12 },
            { id: 'label', type: 'text', label: 'Чего', placeholder: 'стран, где она пробовала местный кофе', required: true, maxLength: 90 },
          ],
        },
      ],
    },
    {
      id: 'rules',
      title: 'Правила жизни',
      description: 'Фирменная рубрика: короткие правила, по которым живёт герой.',
      audience: 'owner',
      fields: [
        {
          id: 'rules',
          type: 'list',
          label: 'Правила',
          itemLabel: 'Правило',
          addLabel: 'Добавить правило',
          max: 15,
          fields: [{ id: 'text', type: 'text', label: 'Правило', placeholder: 'Никогда не опаздывать на плов', required: true }],
        },
      ],
    },
    {
      id: 'photos',
      title: 'Фотографии',
      description: 'Для обложки нужен портрет хорошего качества, остальные — любые.',
      audience: 'owner',
      fields: [
        {
          id: 'cover',
          type: 'photos',
          label: 'Портрет для обложки',
          hint: 'Вертикальный кадр, лицо крупно, без сильных фильтров.',
          required: true,
          max: 3,
        },
        { id: 'childhood', type: 'photos', label: 'Детские фото', hint: 'Для рубрики «Тогда и сейчас».', max: 12 },
        { id: 'gallery', type: 'photos', label: 'Фото для разворотов', hint: 'Чем больше хороших кадров, тем богаче номер.', max: 70 },
      ],
    },
    {
      id: 'insight',
      title: 'Инсайд для журнала',
      description: 'Ваш текст войдёт в рубрику друзей. Пишите так, как сказали бы на тосте.',
      audience: 'contributor',
      fields: [
        { id: 'relation', type: 'text', label: 'Кем вы приходитесь герою', placeholder: 'Подруга с первого курса', required: true },
        { id: 'oneWord', type: 'text', label: 'Герой одним словом', placeholder: 'Ураган', maxLength: 30 },
        { id: 'story', type: 'textarea', label: 'История, которую знаете только вы', required: true },
        { id: 'wish', type: 'textarea', label: 'Пожелание', rows: 3 },
        { id: 'photos', type: 'photos', label: 'Ваши общие фото', max: 5 },
      ],
    },
  ],
};
