import { normalizeColor } from './color';
import {
  createGrid,
  ellipsePoints,
  floodFill,
  gridSize,
  isRectangular,
  linePoints,
  mapGrid,
  rectPoints,
  resizeGrid,
  setCell,
  setCells,
  shiftGrid,
} from './grid';
import {
  PixelmationFormatError,
  type Cell,
  type HexColor,
  type Point,
  type Size,
  type Texture,
  type TextureCells,
} from './types';

/** Минимальная сторона холста. */
export const MIN_CANVAS_SIZE = 1;
/** Максимальная сторона холста. Ограничение — здравый смысл и скорость отрисовки. */
export const MAX_CANVAS_SIZE = 512;
/** Готовые размеры для стартового экрана. */
export const SIZE_PRESETS = [8, 16, 24, 32, 48, 64, 128, 256] as const;

const emptyCell = (): Cell => null;

/** Ограничивает сторону холста допустимым диапазоном. */
export function clampCanvasSize(value: number): number {
  if (!Number.isFinite(value)) return MIN_CANVAS_SIZE;
  return Math.min(MAX_CANVAS_SIZE, Math.max(MIN_CANVAS_SIZE, Math.floor(value)));
}

/** Новая пустая текстура. */
export function createTexture(width: number, height: number, name = ''): Texture {
  return {
    name,
    cells: createGrid<Cell>(clampCanvasSize(width), clampCanvasSize(height), emptyCell),
  };
}

/** Размер текстуры. */
export function textureSize(texture: Texture): Size {
  return gridSize(texture.cells);
}

/** Цвет пикселя (или `undefined` за границами). */
export function getPixel(texture: Texture, x: number, y: number): Cell | undefined {
  return texture.cells[y]?.[x];
}

/** Устанавливает пиксель. Цвет нормализуется, полностью прозрачный становится `null`. */
export function setPixel(texture: Texture, x: number, y: number, color: unknown): Texture {
  const value = normalizeColor(color);
  const cells = setCell(texture.cells, x, y, value);
  return cells === texture.cells ? texture : { ...texture, cells };
}

/** Устанавливает сразу несколько пикселей одним цветом. */
export function setPixels(texture: Texture, points: Iterable<Point>, color: unknown): Texture {
  const value = normalizeColor(color);
  const cells = setCells(texture.cells, points, value);
  return cells === texture.cells ? texture : { ...texture, cells };
}

/** Отрезок между двумя точками. */
export function drawLine(texture: Texture, from: Point, to: Point, color: unknown): Texture {
  return setPixels(texture, linePoints(from.x, from.y, to.x, to.y), color);
}

/** Прямоугольник: контур или заливка. */
export function drawRect(
  texture: Texture,
  from: Point,
  to: Point,
  color: unknown,
  filled = false,
): Texture {
  return setPixels(texture, rectPoints(from.x, from.y, to.x, to.y, filled), color);
}

/** Эллипс, вписанный в прямоугольник: контур или заливка. */
export function drawEllipse(
  texture: Texture,
  from: Point,
  to: Point,
  color: unknown,
  filled = false,
): Texture {
  return setPixels(texture, ellipsePoints(from.x, from.y, to.x, to.y, filled), color);
}

/** Заливка связной области того же цвета. */
export function fillArea(texture: Texture, x: number, y: number, color: unknown): Texture {
  const value = normalizeColor(color);
  const cells = floodFill(texture.cells, x, y, value);
  return cells === texture.cells ? texture : { ...texture, cells };
}

/** Сдвиг всего рисунка. */
export function shiftTexture(texture: Texture, dx: number, dy: number, wrap = false): Texture {
  return { ...texture, cells: shiftGrid(texture.cells, dx, dy, emptyCell, wrap) };
}

/** Изменение размера холста (содержимое остаётся в левом верхнем углу). */
export function resizeTexture(texture: Texture, width: number, height: number): Texture {
  return {
    ...texture,
    cells: resizeGrid(texture.cells, clampCanvasSize(width), clampCanvasSize(height), emptyCell),
  };
}

/** Полная очистка холста. */
export function clearTexture(texture: Texture): Texture {
  const { width, height } = textureSize(texture);
  return { ...texture, cells: createGrid<Cell>(width, height, emptyCell) };
}

/** Замена одного цвета другим по всему холсту. */
export function replaceColor(texture: Texture, from: unknown, to: unknown): Texture {
  const source = normalizeColor(from);
  const target = normalizeColor(to);
  if (source === target) return texture;
  return { ...texture, cells: mapGrid(texture.cells, (cell) => (cell === source ? target : cell)) };
}

/** Палитра текстуры: уникальные цвета с числом пикселей, по убыванию частоты. */
export function texturePalette(texture: Texture): Array<{ color: HexColor; count: number }> {
  const counts = new Map<HexColor, number>();
  for (const row of texture.cells) {
    for (const cell of row) {
      if (cell === null) continue;
      counts.set(cell, (counts.get(cell) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count || a.color.localeCompare(b.color));
}

/** Количество непрозрачных пикселей. */
export function countPainted(texture: Texture): number {
  let total = 0;
  for (const row of texture.cells) {
    for (const cell of row) if (cell !== null) total++;
  }
  return total;
}

/** Приводит клетки к каноническому виду и проверяет прямоугольность. */
export function normalizeTexture(texture: Texture): Texture {
  if (!isRectangular(texture.cells)) {
    throw new PixelmationFormatError('Клетки текстуры должны образовывать прямоугольник');
  }
  const { width, height } = gridSize(texture.cells);
  if (width > MAX_CANVAS_SIZE || height > MAX_CANVAS_SIZE) {
    throw new PixelmationFormatError(
      `Размер ${width}×${height} превышает максимум ${MAX_CANVAS_SIZE}×${MAX_CANVAS_SIZE}`,
    );
  }
  return {
    name: typeof texture.name === 'string' ? texture.name : '',
    cells: mapGrid(texture.cells, (cell) => normalizeColor(cell)) as TextureCells,
  };
}

/** Полная копия текстуры. */
export function cloneTexture(texture: Texture): Texture {
  return { name: texture.name, cells: texture.cells.map((row) => row.slice()) };
}
