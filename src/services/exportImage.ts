/** Экспорт картинок: PNG через canvas, анимированный GIF — собственным энкодером. */
import {
  encodeGif,
  renderAnimation,
  renderCells,
  resolveSlide,
  toFileName,
  type Animation,
  type Cell,
  type RgbaImage,
  type Texture,
} from '~/core';
import { downloadBlob } from './files';

/** Переносит RGBA-буфер на canvas. */
function toCanvas(image: RgbaImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не удалось получить контекст canvas');
  context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Не удалось собрать PNG'));
    }, 'image/png');
  });
}

/** PNG как data URL — удобно для превью и для агента. */
export function imageToDataUrl(image: RgbaImage): string {
  return toCanvas(image).toDataURL('image/png');
}

/** Сохраняет текстуру в PNG. */
export async function exportTexturePng(
  texture: Texture,
  options: { scale?: number; background?: Cell } = {},
): Promise<string> {
  const image = renderCells(texture.cells, { scale: options.scale ?? 8, background: options.background });
  const fileName = toFileName(texture.name || 'texture', '.png');
  downloadBlob(fileName, await canvasToBlob(toCanvas(image)));
  return fileName;
}

/** Сохраняет один слайд анимации в PNG. */
export async function exportSlidePng(
  animation: Animation,
  index: number,
  options: { scale?: number; background?: Cell } = {},
): Promise<string> {
  const slide = animation.slides[index];
  if (!slide) throw new RangeError(`Слайда ${index + 1} не существует`);
  const image = renderCells(resolveSlide(slide, animation.texture), {
    scale: options.scale ?? 8,
    background: options.background,
  });
  const fileName = toFileName(`${animation.name || 'animation'}_${index + 1}`, '.png');
  downloadBlob(fileName, await canvasToBlob(toCanvas(image)));
  return fileName;
}

/** Собирает анимированный GIF. */
export function buildGif(
  animation: Animation,
  options: { scale?: number; delayMs?: number; background?: Cell } = {},
): Uint8Array {
  const frames = renderAnimation(animation, {
    scale: options.scale ?? 8,
    background: options.background,
  });
  return encodeGif(frames, { delayMs: options.delayMs ?? 200 });
}

/** Сохраняет анимацию в GIF. */
export function exportAnimationGif(
  animation: Animation,
  options: { scale?: number; delayMs?: number; background?: Cell } = {},
): string {
  const gif = buildGif(animation, options);
  const fileName = toFileName(animation.name || 'animation', '.gif');
  downloadBlob(fileName, new Blob([gif as BlobPart], { type: 'image/gif' }));
  return fileName;
}
