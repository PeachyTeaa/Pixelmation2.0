import type { Grid, Point, Size } from './types';

/** Компаратор клеток. */
export type Eq<T> = (a: T, b: T) => boolean;

const defaultEq = <T,>(a: T, b: T): boolean => Object.is(a, b);

/** Размер сетки. Пустая сетка — `0 × 0`. */
export function gridSize<T>(grid: Grid<T>): Size {
  const height = grid.length;
  const width = height === 0 ? 0 : grid[0].length;
  return { width, height };
}

/** Создаёт сетку `width × height`, заполненную значением из фабрики. */
export function createGrid<T>(width: number, height: number, fill: () => T): Grid<T> {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  return Array.from({ length: h }, () => Array.from({ length: w }, fill));
}

/** Глубокая копия сетки (значения копируются как есть, ссылки не клонируются). */
export function cloneGrid<T>(grid: Grid<T>): Grid<T> {
  return grid.map((row) => row.slice());
}

/** Проверка попадания координат в сетку. */
export function inBounds<T>(grid: Grid<T>, x: number, y: number): boolean {
  return y >= 0 && y < grid.length && x >= 0 && x < (grid[y]?.length ?? 0);
}

/** Значение клетки или `undefined` за границами. */
export function getCell<T>(grid: Grid<T>, x: number, y: number): T | undefined {
  return inBounds(grid, x, y) ? grid[y][x] : undefined;
}

/**
 * Возвращает новую сетку с изменённой клеткой.
 * Строки, которых изменение не коснулось, переиспользуются — так дешевле сравнивать в React.
 */
export function setCell<T>(grid: Grid<T>, x: number, y: number, value: T): Grid<T> {
  if (!inBounds(grid, x, y)) return grid;
  const next = grid.slice();
  const row = next[y].slice();
  row[x] = value;
  next[y] = row;
  return next;
}

/** Массовая установка клеток за один проход. Координаты за границами игнорируются. */
export function setCells<T>(grid: Grid<T>, points: Iterable<Point>, value: T): Grid<T> {
  let next: Grid<T> | null = null;
  const touched = new Set<number>();
  for (const { x, y } of points) {
    if (!inBounds(grid, x, y)) continue;
    if (!next) next = grid.slice();
    if (!touched.has(y)) {
      next[y] = next[y].slice();
      touched.add(y);
    }
    next[y][x] = value;
  }
  return next ?? grid;
}

/** Точки отрезка по Брезенхэму, включая обе конечные. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  const points: Point[] = [];
  let x = Math.round(x0);
  let y = Math.round(y0);
  const endX = Math.round(x1);
  const endY = Math.round(y1);
  const dx = Math.abs(endX - x);
  const dy = -Math.abs(endY - y);
  const sx = x < endX ? 1 : -1;
  const sy = y < endY ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    points.push({ x, y });
    if (x === endX && y === endY) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return points;
}

/** Точки прямоугольника: контур или заливка. */
export function rectPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled = false,
): Point[] {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const points: Point[] = [];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const onEdge = x === left || x === right || y === top || y === bottom;
      if (filled || onEdge) points.push({ x, y });
    }
  }
  return points;
}

/** Точки эллипса, вписанного в прямоугольник (контур или заливка). */
export function ellipsePoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled = false,
): Point[] {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const rx = Math.max(0.5, (right - left) / 2);
  const ry = Math.max(0.5, (bottom - top) / 2);
  const points: Point[] = [];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const inside = nx * nx + ny * ny <= 1.02;
      if (!inside) continue;
      if (filled) {
        points.push({ x, y });
        continue;
      }
      const neighbours = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      const isEdge = neighbours.some(([px, py]) => {
        const dx = (px - cx) / rx;
        const dy = (py - cy) / ry;
        return dx * dx + dy * dy > 1.02;
      });
      if (isEdge) points.push({ x, y });
    }
  }
  return points;
}

/** Точки связной области того же значения, что и в стартовой клетке (4-связность). */
export function floodRegion<T>(
  grid: Grid<T>,
  x: number,
  y: number,
  eq: Eq<T> = defaultEq,
): Point[] {
  if (!inBounds(grid, x, y)) return [];
  const target = grid[y][x];
  const { width, height } = gridSize(grid);
  const seen = new Uint8Array(width * height);
  const stack: Point[] = [{ x, y }];
  const region: Point[] = [];

  while (stack.length) {
    const point = stack.pop()!;
    if (!inBounds(grid, point.x, point.y)) continue;
    const key = point.y * width + point.x;
    if (seen[key]) continue;
    if (!eq(grid[point.y][point.x], target)) continue;
    seen[key] = 1;
    region.push(point);
    stack.push({ x: point.x + 1, y: point.y });
    stack.push({ x: point.x - 1, y: point.y });
    stack.push({ x: point.x, y: point.y + 1 });
    stack.push({ x: point.x, y: point.y - 1 });
  }
  return region;
}

/** Заливка области значением. */
export function floodFill<T>(
  grid: Grid<T>,
  x: number,
  y: number,
  value: T,
  eq: Eq<T> = defaultEq,
): Grid<T> {
  if (!inBounds(grid, x, y)) return grid;
  if (eq(grid[y][x], value)) return grid;
  return setCells(grid, floodRegion(grid, x, y, eq), value);
}

/**
 * Сдвиг всего содержимого на `dx, dy`.
 * `wrap = false` — уехавшее за край теряется, освободившееся заполняется `empty()`.
 * `wrap = true` — содержимое закольцовывается.
 */
export function shiftGrid<T>(
  grid: Grid<T>,
  dx: number,
  dy: number,
  empty: () => T,
  wrap = false,
): Grid<T> {
  const { width, height } = gridSize(grid);
  if (width === 0 || height === 0) return grid;
  const next = createGrid(width, height, empty);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let tx = x + dx;
      let ty = y + dy;
      if (wrap) {
        tx = ((tx % width) + width) % width;
        ty = ((ty % height) + height) % height;
      } else if (tx < 0 || tx >= width || ty < 0 || ty >= height) {
        continue;
      }
      next[ty][tx] = grid[y][x];
    }
  }
  return next;
}

/** Меняет размер сетки, оставляя содержимое в левом верхнем углу. */
export function resizeGrid<T>(
  grid: Grid<T>,
  width: number,
  height: number,
  empty: () => T,
): Grid<T> {
  const next = createGrid(width, height, empty);
  const source = gridSize(grid);
  const rows = Math.min(source.height, next.length);
  for (let y = 0; y < rows; y++) {
    const cols = Math.min(source.width, next[y]?.length ?? 0);
    for (let x = 0; x < cols; x++) next[y][x] = grid[y][x];
  }
  return next;
}

/** Поэлементное преобразование сетки. */
export function mapGrid<T, R>(grid: Grid<T>, fn: (value: T, x: number, y: number) => R): Grid<R> {
  return grid.map((row, y) => row.map((value, x) => fn(value, x, y)));
}

/** Проверка, что сетка прямоугольная и непустая. */
export function isRectangular<T>(grid: Grid<T>): boolean {
  if (!Array.isArray(grid) || grid.length === 0) return false;
  const width = grid[0]?.length ?? 0;
  if (width === 0) return false;
  return grid.every((row) => Array.isArray(row) && row.length === width);
}
