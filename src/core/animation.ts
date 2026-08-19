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
import { normalizeColor } from './color';
import { cloneTexture, createTexture, resizeTexture, setPixel, textureSize } from './texture';
import {
  PixelmationFormatError,
  type Animation,
  type Cell,
  type Point,
  type Size,
  type Slide,
  type SlideCell,
  type Texture,
  type TextureCells,
} from './types';

const emptyRef = (): SlideCell => null;

/** Сравнение ссылок на пиксель текстуры. */
export function refEquals(a: SlideCell, b: SlideCell): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y;
}

/** Пустой слайд заданного размера. */
export function createSlide(width: number, height: number): Slide {
  return createGrid<SlideCell>(width, height, emptyRef);
}

/** Новая анимация на основе текстуры. Всегда содержит хотя бы один слайд. */
export function createAnimation(texture: Texture, name = '', slides?: Slide[]): Animation {
  const { width, height } = textureSize(texture);
  const list = slides && slides.length > 0 ? slides : [createSlide(width, height)];
  return { name, slides: list, texture: cloneTexture(texture) };
}

/** Пустая анимация с пустой текстурой заданного размера. */
export function createBlankAnimation(width: number, height: number, name = ''): Animation {
  return createAnimation(createTexture(width, height, name), name);
}

/** Размер кадра (совпадает с размером текстуры). */
export function animationSize(animation: Animation): Size {
  return textureSize(animation.texture);
}

/** Ссылка в клетке слайда. */
export function getRef(animation: Animation, slideIndex: number, x: number, y: number): SlideCell | undefined {
  return animation.slides[slideIndex]?.[y]?.[x];
}

/** Итоговый цвет клетки слайда: берётся из привязанной текстуры. */
export function resolveRef(texture: Texture, ref: SlideCell): Cell {
  if (ref === null) return null;
  return texture.cells[ref.y]?.[ref.x] ?? null;
}

/** Превращает слайд в обычную сетку цветов — для отрисовки и экспорта. */
export function resolveSlide(slide: Slide, texture: Texture): TextureCells {
  return mapGrid(slide, (ref) => resolveRef(texture, ref));
}

function replaceSlide(animation: Animation, index: number, slide: Slide): Animation {
  if (!animation.slides[index] || animation.slides[index] === slide) return animation;
  const slides = animation.slides.slice();
  slides[index] = slide;
  return { ...animation, slides };
}

/** Ставит ссылку в клетку слайда. */
export function setRef(
  animation: Animation,
  slideIndex: number,
  x: number,
  y: number,
  ref: SlideCell,
): Animation {
  const slide = animation.slides[slideIndex];
  if (!slide) return animation;
  return replaceSlide(animation, slideIndex, setCell(slide, x, y, ref));
}

/** Ставит ссылку сразу в несколько клеток. */
export function setRefs(
  animation: Animation,
  slideIndex: number,
  points: Iterable<Point>,
  ref: SlideCell,
): Animation {
  const slide = animation.slides[slideIndex];
  if (!slide) return animation;
  return replaceSlide(animation, slideIndex, setCells(slide, points, ref));
}

/** Отрезок ссылок. */
export function drawRefLine(
  animation: Animation,
  slideIndex: number,
  from: Point,
  to: Point,
  ref: SlideCell,
): Animation {
  return setRefs(animation, slideIndex, linePoints(from.x, from.y, to.x, to.y), ref);
}

/** Прямоугольник из ссылок. */
export function drawRefRect(
  animation: Animation,
  slideIndex: number,
  from: Point,
  to: Point,
  ref: SlideCell,
  filled = false,
): Animation {
  return setRefs(animation, slideIndex, rectPoints(from.x, from.y, to.x, to.y, filled), ref);
}

/** Эллипс из ссылок. */
export function drawRefEllipse(
  animation: Animation,
  slideIndex: number,
  from: Point,
  to: Point,
  ref: SlideCell,
  filled = false,
): Animation {
  return setRefs(animation, slideIndex, ellipsePoints(from.x, from.y, to.x, to.y, filled), ref);
}

/** Заливка связной области слайда ссылкой. */
export function fillRefArea(
  animation: Animation,
  slideIndex: number,
  x: number,
  y: number,
  ref: SlideCell,
): Animation {
  const slide = animation.slides[slideIndex];
  if (!slide) return animation;
  return replaceSlide(animation, slideIndex, floodFill(slide, x, y, ref, refEquals));
}

/** Сдвиг содержимого слайда. */
export function shiftSlide(
  animation: Animation,
  slideIndex: number,
  dx: number,
  dy: number,
  wrap = false,
): Animation {
  const slide = animation.slides[slideIndex];
  if (!slide) return animation;
  return replaceSlide(animation, slideIndex, shiftGrid(slide, dx, dy, emptyRef, wrap));
}

/** Очистка слайда. */
export function clearSlide(animation: Animation, slideIndex: number): Animation {
  const slide = animation.slides[slideIndex];
  if (!slide) return animation;
  const { width, height } = gridSize(slide);
  return replaceSlide(animation, slideIndex, createSlide(width, height));
}

/** Вставляет пустой слайд после указанного. Возвращает анимацию и индекс нового слайда. */
export function addSlide(animation: Animation, afterIndex: number): { animation: Animation; index: number } {
  const { width, height } = animationSize(animation);
  const index = Math.min(Math.max(afterIndex + 1, 0), animation.slides.length);
  const slides = animation.slides.slice();
  slides.splice(index, 0, createSlide(width, height));
  return { animation: { ...animation, slides }, index };
}

/** Вставляет копию слайда сразу после него. */
export function duplicateSlide(animation: Animation, index: number): { animation: Animation; index: number } {
  const source = animation.slides[index];
  if (!source) return { animation, index };
  const slides = animation.slides.slice();
  slides.splice(index + 1, 0, source.map((row) => row.slice()));
  return { animation: { ...animation, slides }, index: index + 1 };
}

/** Вставляет текстуру целиком как новый слайд после указанного. */
export function insertTextureAsSlide(
  animation: Animation,
  index: number,
): { animation: Animation; index: number } {
  const slide: Slide = mapGrid(animation.texture.cells, (cell, x, y) =>
    cell === null ? null : { x, y },
  );
  const at = Math.min(Math.max(index + 1, 0), animation.slides.length);
  const slides = animation.slides.slice();
  slides.splice(at, 0, slide);
  return { animation: { ...animation, slides }, index: at };
}

/** Удаляет слайд. Последний слайд удалить нельзя — он просто очищается. */
export function deleteSlide(animation: Animation, index: number): { animation: Animation; index: number } {
  if (!animation.slides[index]) return { animation, index };
  if (animation.slides.length === 1) {
    return { animation: clearSlide(animation, 0), index: 0 };
  }
  const slides = animation.slides.slice();
  slides.splice(index, 1);
  const next = Math.min(index, slides.length - 1);
  return { animation: { ...animation, slides }, index: next };
}

/** Переносит слайд на новую позицию (для перетаскивания на таймлайне). */
export function moveSlide(animation: Animation, from: number, to: number): { animation: Animation; index: number } {
  const total = animation.slides.length;
  if (from < 0 || from >= total) return { animation, index: from };
  const target = Math.min(Math.max(to, 0), total - 1);
  if (target === from) return { animation, index: from };
  const slides = animation.slides.slice();
  const [moved] = slides.splice(from, 1);
  slides.splice(target, 0, moved);
  return { animation: { ...animation, slides }, index: target };
}

/** Вставляет готовый слайд на позицию (используется буфером обмена слайдов). */
export function insertSlide(animation: Animation, index: number, slide: Slide): { animation: Animation; index: number } {
  const at = Math.min(Math.max(index, 0), animation.slides.length);
  const slides = animation.slides.slice();
  slides.splice(at, 0, slide.map((row) => row.slice()));
  return { animation: { ...animation, slides }, index: at };
}

/** Число непрозрачных клеток слайда. */
export function countPaintedRefs(slide: Slide): number {
  let total = 0;
  for (const row of slide) for (const ref of row) if (ref !== null) total++;
  return total;
}

/**
 * Убирает ссылки, которые указывают за пределы текстуры или на прозрачный пиксель.
 * Аналог `fixSlides` из первой версии, но без потери остальных данных.
 */
export function sanitizeAnimation(animation: Animation): Animation {
  const { width, height } = animationSize(animation);
  const slides = animation.slides.map((slide) => {
    const sized = gridSize(slide);
    const fitted =
      sized.width === width && sized.height === height
        ? slide
        : resizeGrid(slide, width, height, emptyRef);
    return mapGrid(fitted, (ref) => {
      if (ref === null) return null;
      const color = animation.texture.cells[ref.y]?.[ref.x];
      return color === undefined || color === null ? null : ref;
    });
  });
  return { ...animation, slides };
}

/** Меняет размер и текстуры, и всех слайдов. */
export function resizeAnimation(animation: Animation, width: number, height: number): Animation {
  const texture = resizeTexture(animation.texture, width, height);
  const size = textureSize(texture);
  const slides = animation.slides.map((slide) =>
    resizeGrid(slide, size.width, size.height, emptyRef),
  );
  return sanitizeAnimation({ ...animation, texture, slides });
}

/** Заменяет привязанную текстуру, подчищая ставшие невалидными ссылки. */
export function withTexture(animation: Animation, texture: Texture): Animation {
  const size = textureSize(texture);
  const next: Animation = {
    ...animation,
    texture: cloneTexture(texture),
    slides: animation.slides.map((slide) => resizeGrid(slide, size.width, size.height, emptyRef)),
  };
  return sanitizeAnimation(next);
}

/**
 * Находит в текстуре пиксель нужного цвета, а если такого нет — красит первую
 * свободную клетку. Нужно, чтобы можно было рисовать по кадру сразу цветом,
 * не выбирая ссылку вручную.
 */
export function ensureColorRef(
  texture: Texture,
  color: unknown,
): { texture: Texture; ref: SlideCell } {
  const value = normalizeColor(color);
  if (value === null) return { texture, ref: null };

  for (let y = 0; y < texture.cells.length; y++) {
    const row = texture.cells[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === value) return { texture, ref: { x, y } };
    }
  }

  for (let y = 0; y < texture.cells.length; y++) {
    const row = texture.cells[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === null) {
        return { texture: setPixel(texture, x, y, value), ref: { x, y } };
      }
    }
  }

  throw new PixelmationFormatError(
    `В текстуре нет свободной клетки для цвета ${value}: увеличьте размер холста`,
  );
}

/** Проверяет структуру анимации и приводит слайды к размеру текстуры. */
export function normalizeAnimation(animation: Animation): Animation {
  if (!Array.isArray(animation.slides) || animation.slides.length === 0) {
    throw new PixelmationFormatError('Анимация должна содержать хотя бы один слайд');
  }
  for (const slide of animation.slides) {
    if (!isRectangular(slide)) {
      throw new PixelmationFormatError('Каждый слайд должен быть прямоугольной сеткой');
    }
  }
  return sanitizeAnimation({
    ...animation,
    name: typeof animation.name === 'string' ? animation.name : '',
  });
}
