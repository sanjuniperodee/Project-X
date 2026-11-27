import type { ProductInput } from '@px/contracts';

/**
 * MyGame — a custom board game about a group of friends, a family or an office team.
 */
export const boardgame: ProductInput = {
  id: 'boardgame',
  name: 'MyGame',
  domain: 'mygame.kz',
  tagline: 'Настольная игра про вашу компанию — с вашими мемами и лицами',
  deposit: 10_000,
  productionDays: 10,
  formats: [
    {
      id: 'conflict-cards',
      name: 'Карты конфликта',
      description: 'Колода провокационных вопросов и заданий про вашу компанию.',
      price: 30_000,
      specs: ['110 карт', 'Коробка с вашим названием', 'Правила на 3–12 игроков'],
    },
    {
      id: 'quiz',
      name: 'Викторина',
      description: 'Кто лучше знает друг друга: вопросы, поле и фишки.',
      price: 35_000,
      recommended: true,
      specs: ['150 вопросов о вас', 'Игровое поле 40×40 см', 'Фишки, кубик, песочные часы'],
    },
    {
      id: 'city-tycoon',
      name: 'Своя экономическая',
      description: 'Поле из ваших мест: офис, любимое кафе, дача. Деньги с лицами игроков.',
      price: 45_000,
      specs: ['Поле 50×50 см', '28 карточек собственности', 'Деньги с вашими лицами', 'Карточки «Шанс» из ваших историй'],
    },
  ],
  extras: [
    {
      id: 'extra-set',
      name: 'Ещё одна коробка',
      description: 'Копия игры — для второго офиса или в подарок.',
      unitPrice: 18_000,
      maxQuantity: 30,
    },
    {
      id: 'face-pawns',
      name: 'Фишки с лицами',
      description: 'Акриловые фишки с портретами игроков.',
      unitPrice: 6_000,
      maxQuantity: 1,
    },
  ],
  b2b: {
    priceFrom: 150_000,
    description: 'Тираж от 10 коробок для корпоратива, тимбилдинга или HR-подарков. Брендируем коробку и поле.',
  },
  collaboration: {
    enabled: true,
    contributorNoun: 'участники',
    inviteTitle: 'Закиньте свои мемы в игру',
    inviteDescription:
      'Компания делает настолку про себя. Добавьте историю, шутку или вопрос — лучшие попадут в колоду.',
  },
  steps: [
    {
      id: 'company',
      title: 'Про компанию',
      audience: 'owner',
      fields: [
        { id: 'groupName', type: 'text', label: 'Как называется ваша компания', placeholder: 'Отдел продаж «Акулы»', required: true },
        {
          id: 'groupType',
          type: 'select',
          label: 'Кто будет играть',
          required: true,
          options: [
            { value: 'friends', label: 'Друзья' },
            { value: 'family', label: 'Семья' },
            { value: 'office', label: 'Коллеги' },
            { value: 'class', label: 'Одноклассники или однокурсники' },
          ],
        },
        {
          id: 'tone',
          type: 'choice',
          label: 'Градус игры',
          required: true,
          options: [
            { value: 'family', label: 'Для всей семьи', description: 'Добрые вопросы, можно играть с детьми' },
            { value: 'roast', label: 'С подколками', description: 'Шутим друг над другом, но без обид' },
            { value: 'adult', label: 'Только для взрослых', description: '18+, откровенные вопросы' },
          ],
        },
      ],
    },
    {
      id: 'players',
      title: 'Игроки',
      description: 'Каждый игрок станет персонажем: с портретом, прозвищем и суперсилой.',
      audience: 'owner',
      fields: [
        {
          id: 'players',
          type: 'list',
          label: 'Игроки',
          itemLabel: 'Игрок',
          addLabel: 'Добавить игрока',
          required: true,
          min: 2,
          max: 40,
          fields: [
            { id: 'name', type: 'text', label: 'Имя', required: true },
            { id: 'nickname', type: 'text', label: 'Прозвище', placeholder: 'Мистер Дедлайн' },
            { id: 'fame', type: 'textarea', label: 'Чем знаменит', rows: 2, maxLength: 500 },
            { id: 'photo', type: 'photos', label: 'Фото', max: 1 },
          ],
        },
      ],
    },
    {
      id: 'lore',
      title: 'Места и мемы',
      description: 'Из этого получатся клетки поля и карточки событий.',
      audience: 'owner',
      fields: [
        {
          id: 'places',
          type: 'list',
          label: 'Ваши места',
          itemLabel: 'Место',
          addLabel: 'Добавить место',
          max: 28,
          fields: [
            { id: 'name', type: 'text', label: 'Название', placeholder: 'Кофейня у офиса', required: true },
            { id: 'story', type: 'text', label: 'Чем знаменито', maxLength: 300 },
          ],
        },
        { id: 'jokes', type: 'textarea', label: 'Локальные шутки, фразы и мемы', hint: 'По одной на строку.' },
      ],
    },
    {
      id: 'contribution',
      title: 'Ваш вклад в игру',
      audience: 'contributor',
      fields: [
        { id: 'story', type: 'textarea', label: 'История, которая должна попасть в игру', required: true },
        { id: 'question', type: 'text', label: 'Вопрос для викторины', placeholder: 'Кто уснул на корпоративе в 2023?' },
        { id: 'answer', type: 'text', label: 'Правильный ответ' },
        { id: 'photos', type: 'photos', label: 'Мемные фото', max: 5 },
      ],
    },
  ],
};
