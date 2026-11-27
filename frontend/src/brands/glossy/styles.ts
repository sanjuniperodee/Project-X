/**
 * The four Cover Me styles as the customer sees them. Ids match the questionnaire's
 * «Стиль номера» options in the catalog and the layout service's themes.
 */
export type GlossyStyleId = 'vogue' | 'tabloid' | 'tender' | 'noir';

export interface GlossyStyleInfo {
  id: GlossyStyleId;
  name: string;
  /** One line about the look. */
  look: string;
  /** Who it suits. */
  forWhom: string;
  swatch: string;
}

export const GLOSSY_STYLES: GlossyStyleInfo[] = [
  {
    id: 'vogue',
    name: 'Глянец',
    look: 'Чёрно-белая классика, большие портреты. Цвет номера подбираем по фото обложки.',
    forWhom: 'Беспроигрышно на день рождения подруги, мамы, сестры',
    swatch: '#aa0e2d',
  },
  {
    id: 'tabloid',
    name: 'Таблоид',
    look: 'Красный и жёлтый, громкие заголовки, «сенсации» и восклицательные знаки.',
    forWhom: 'Для компании, которая любит подкалывать именинника',
    swatch: '#e10600',
  },
  {
    id: 'tender',
    name: 'Нежность',
    look: 'Пудровые тона, тонкий курсив, много воздуха и круглые портреты.',
    forWhom: 'Годовщина, свадьба, подарок маме или бабушке',
    swatch: '#b56d70',
  },
  {
    id: 'noir',
    name: 'Нуар',
    look: 'Чёрные страницы, золото и разрядка, как титры старого кино.',
    forWhom: 'Юбилеи, мужчины, руководители, всё, что «посолиднее»',
    swatch: '#c9a24a',
  },
];
