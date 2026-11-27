import type { ProductInput } from '@px/contracts';

/**
 * Шежіре — family atlas: genealogy book, restored archive photos and an interior tree poster.
 */
export const shezhire: ProductInput = {
  id: 'shezhire',
  name: 'Шежіре',
  domain: 'shezhire.kz',
  tagline: 'Книга рода и древо семьи, которое передают детям',
  deposit: 10_000,
  productionDays: 21,
  formats: [
    {
      id: 'book',
      name: 'Книга рода',
      description: 'Летопись семьи с древом на развороте и отреставрированными фото.',
      price: 45_000,
      specs: ['Твёрдый переплёт A4', '48 страниц', 'Древо до 7 поколений', 'Реставрация до 15 фото'],
    },
    {
      id: 'book-poster',
      name: 'Книга и постер-древо',
      description: 'Книга рода и интерьерный постер с древом в раме.',
      price: 60_000,
      recommended: true,
      specs: ['Всё из «Книги рода»', 'Постер 50×70 см в деревянной раме', 'Реставрация до 30 фото'],
    },
    {
      id: 'heritage',
      name: 'Наследие',
      description: 'Книга в льняном переплёте с тиснением и древо на холсте.',
      price: 80_000,
      specs: ['Льняной переплёт с тиснением', '64 страницы', 'Холст 60×90 см в раме', 'Реставрация до 60 фото'],
    },
  ],
  extras: [
    {
      id: 'extra-book',
      name: 'Книга для родственников',
      description: 'Ещё один экземпляр книги — для каждой ветви семьи.',
      unitPrice: 25_000,
      maxQuantity: 15,
    },
    {
      id: 'restoration-pack',
      name: 'Реставрация ещё 20 фото',
      description: 'Убираем заломы и пятна, возвращаем резкость и цвет.',
      unitPrice: 8_000,
      maxQuantity: 5,
    },
    {
      id: 'bilingual',
      name: 'Текст на казахском и русском',
      description: 'Параллельный перевод летописи.',
      unitPrice: 12_000,
      maxQuantity: 1,
    },
  ],
  collaboration: {
    enabled: true,
    contributorNoun: 'родные',
    inviteTitle: 'Добавьте свою ветвь в шежіре',
    inviteDescription:
      'Семья собирает книгу рода. Расскажите, что помните о старших, и загрузите фото из домашнего альбома.',
  },
  steps: [
    {
      id: 'family',
      title: 'Чей это род',
      audience: 'owner',
      fields: [
        { id: 'familyName', type: 'text', label: 'Фамилия или имя рода', placeholder: 'Сейткалиевы', required: true },
        { id: 'ru', type: 'text', label: 'Ру и жуз', placeholder: 'Аргын, Средний жуз' },
        { id: 'homeland', type: 'text', label: 'Родные места', placeholder: 'Каркаралинск, Карагандинская область' },
        {
          id: 'dedication',
          type: 'textarea',
          label: 'Кому посвящена книга',
          hint: 'Эти слова будут на первой странице.',
          rows: 3,
        },
      ],
    },
    {
      id: 'tree',
      title: 'Древо',
      description: 'Начните с себя и двигайтесь к старшим. Хватит имени и пары фактов — остальное допишут родные.',
      audience: 'owner',
      fields: [
        {
          id: 'members',
          type: 'list',
          label: 'Члены семьи',
          itemLabel: 'Родственник',
          addLabel: 'Добавить родственника',
          required: true,
          max: 150,
          fields: [
            { id: 'fullName', type: 'text', label: 'Имя и фамилия', required: true },
            {
              id: 'generation',
              type: 'select',
              label: 'Поколение',
              required: true,
              options: [
                { value: 'children', label: 'Дети и внуки' },
                { value: 'self', label: 'Моё поколение' },
                { value: 'parents', label: 'Родители' },
                { value: 'grandparents', label: 'Бабушки и дедушки' },
                { value: 'great-grandparents', label: 'Прабабушки и прадеды' },
                { value: 'ancestors', label: 'Старшие предки' },
              ],
            },
            {
              id: 'line',
              type: 'select',
              label: 'Линия',
              options: [
                { value: 'paternal', label: 'По отцу' },
                { value: 'maternal', label: 'По матери' },
              ],
            },
            { id: 'years', type: 'text', label: 'Годы жизни', placeholder: '1931–2012', maxLength: 40 },
            { id: 'bio', type: 'textarea', label: 'Коротко о человеке', rows: 3, maxLength: 1500 },
            { id: 'photos', type: 'photos', label: 'Фото', max: 5 },
          ],
        },
      ],
    },
    {
      id: 'stories',
      title: 'Семейные истории',
      description: 'Переезды, война, целина, свадьбы — то, что рассказывают за дастарханом.',
      audience: 'owner',
      fields: [
        {
          id: 'stories',
          type: 'list',
          label: 'Истории',
          itemLabel: 'История',
          addLabel: 'Добавить историю',
          max: 30,
          fields: [
            { id: 'title', type: 'text', label: 'О чём история', required: true },
            { id: 'period', type: 'text', label: 'Когда это было', placeholder: '1950-е', maxLength: 60 },
            { id: 'text', type: 'textarea', label: 'Рассказ', required: true },
          ],
        },
      ],
    },
    {
      id: 'archive',
      title: 'Семейный архив',
      description: 'Сфотографируйте старые снимки телефоном при дневном свете. Трещины и пятна мы уберём.',
      audience: 'owner',
      fields: [{ id: 'archive', type: 'photos', label: 'Старые фотографии', max: 150 }],
    },
    {
      id: 'memories',
      title: 'Ваши воспоминания',
      audience: 'contributor',
      fields: [
        { id: 'relation', type: 'text', label: 'Кем вы приходитесь семье', placeholder: 'Внучка Галии апа', required: true },
        { id: 'aboutWhom', type: 'text', label: 'О ком хотите рассказать', required: true },
        { id: 'story', type: 'textarea', label: 'Что вы помните', required: true },
        { id: 'photos', type: 'photos', label: 'Фото из вашего альбома', max: 20 },
      ],
    },
  ],
};
