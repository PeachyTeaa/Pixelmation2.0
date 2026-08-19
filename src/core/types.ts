/**
 * Базовые типы Pixelmation.
 *
 * Соглашение о координатах (важно!):
 *   - сетка хранится построчно: `grid[y][x]`, где `y` — строка, `x` — столбец;
 *   - точка/ссылка `Point` — это `{ x: столбец, y: строка }`.
 *
 * В формате первой версии Pixelmation ссылки писались наоборот (`x` был строкой),
 * поэтому импорт legacy-файлов меняет оси местами — см. `codec.ts`.
 */

/** Цвет в формате `#rrggbbaa` (всегда 9 символов, нижний регистр). */
export type HexColor = string;

/** Клетка текстуры: цвет или `null` (полная прозрачность). */
export type Cell = HexColor | null;

/** Двумерная сетка, индексируется как `grid[y][x]`. */
export type Grid<T> = T[][];

/** Клетки текстуры. */
export type TextureCells = Grid<Cell>;

/** Точка на текстуре: `x` — столбец, `y` — строка. */
export interface Point {
  x: number;
  y: number;
}

/** Размер холста в пикселях. */
export interface Size {
  width: number;
  height: number;
}

/** Формат `.pxlmt` — текстура. */
export interface Texture {
  name: string;
  cells: TextureCells;
}

/** Клетка слайда: ссылка на пиксель текстуры или `null`. */
export type SlideCell = Point | null;

/** Один кадр анимации: сетка ссылок на текстуру. */
export type Slide = Grid<SlideCell>;

/** Формат `.pxlma` — анимация вместе с привязанной текстурой. */
export interface Animation {
  name: string;
  slides: Slide[];
  texture: Texture;
}

/** Растровый кадр в памяти: RGBA8888, длина `width * height * 4`. */
export interface RgbaImage {
  width: number;
  height: number;
  /** Буфер именно на `ArrayBuffer` — так его принимает конструктор `ImageData`. */
  data: Uint8ClampedArray<ArrayBuffer>;
}

/** Компоненты цвета, каждый 0..255. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Ошибка разбора/валидации файла проекта. */
export class PixelmationFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PixelmationFormatError';
  }
}
