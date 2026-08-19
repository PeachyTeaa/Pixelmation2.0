import { resolveSlide } from './animation';
import { blendOver, parseColor } from './color';
import { gridSize } from './grid';
import type { Animation, Cell, RgbaImage, Rgba, Texture, TextureCells } from './types';

/** Настройки растеризации. */
export interface RenderOptions {
  /** Во сколько раз увеличить каждый пиксель. По умолчанию 1. */
  scale?: number;
  /** Непрозрачный фон. `null` — сохранить прозрачность. */
  background?: Cell;
}

const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 };

function toRgba(cell: Cell): Rgba {
  if (cell === null) return TRANSPARENT;
  return parseColor(cell) ?? TRANSPARENT;
}

/** Растеризует сетку цветов в RGBA-буфер. */
export function renderCells(cells: TextureCells, options: RenderOptions = {}): RgbaImage {
  const scale = Math.max(1, Math.floor(options.scale ?? 1));
  const { width, height } = gridSize(cells);
  const outWidth = width * scale;
  const outHeight = height * scale;
  const data = new Uint8ClampedArray(outWidth * outHeight * 4);
  const backdrop = options.background ? parseColor(options.background) : null;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = toRgba(cells[y][x]);
      const pixel = backdrop ? blendOver(cells[y][x], backdrop) : source;
      for (let dy = 0; dy < scale; dy++) {
        const rowStart = ((y * scale + dy) * outWidth + x * scale) * 4;
        for (let dx = 0; dx < scale; dx++) {
          const at = rowStart + dx * 4;
          data[at] = pixel.r;
          data[at + 1] = pixel.g;
          data[at + 2] = pixel.b;
          data[at + 3] = pixel.a;
        }
      }
    }
  }
  return { width: outWidth, height: outHeight, data };
}

/** Растеризует текстуру. */
export function renderTexture(texture: Texture, options: RenderOptions = {}): RgbaImage {
  return renderCells(texture.cells, options);
}

/** Растеризует один слайд анимации. */
export function renderSlide(animation: Animation, index: number, options: RenderOptions = {}): RgbaImage {
  const slide = animation.slides[index];
  if (!slide) throw new RangeError(`Слайда ${index} не существует`);
  return renderCells(resolveSlide(slide, animation.texture), options);
}

/** Растеризует все слайды анимации. */
export function renderAnimation(animation: Animation, options: RenderOptions = {}): RgbaImage[] {
  return animation.slides.map((slide) => renderCells(resolveSlide(slide, animation.texture), options));
}
