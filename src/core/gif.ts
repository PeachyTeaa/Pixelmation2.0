/**
 * GIF89a-энкодер без зависимостей: собирает анимированный GIF из RGBA-кадров.
 *
 * Пиксель-арт обычно укладывается в считанные цвета, поэтому палитра строится
 * точно. Если уникальных цветов больше 255, глубина канала понижается, пока
 * палитра не поместится.
 */
import type { RgbaImage } from './types';

/** Настройки сборки GIF. */
export interface GifOptions {
  /** Задержка кадра в миллисекундах (можно задать общий или на кадр). */
  delayMs?: number | number[];
  /** Сколько раз повторять: 0 — бесконечно. */
  loop?: number;
  /** Пиксели с альфой ниже порога считаются прозрачными (GIF знает только 1 бит альфы). */
  alphaThreshold?: number;
}

interface Palette {
  /** Плоский массив RGB, по три байта на цвет. */
  rgb: number[];
  /** Индекс прозрачного цвета или -1. */
  transparentIndex: number;
  /** Индексы пикселей всех кадров. */
  frames: Uint8Array[];
}

function quantize(frames: RgbaImage[], alphaThreshold: number): Palette {
  // Понижаем глубину канала, пока палитра не влезет в 255 цветов.
  for (let shift = 0; shift <= 6; shift++) {
    const lookup = new Map<number, number>();
    const rgb: number[] = [];
    const indexed: Uint8Array[] = [];
    let overflow = false;

    for (const frame of frames) {
      const indices = new Uint8Array(frame.width * frame.height);
      for (let i = 0; i < indices.length; i++) {
        const at = i * 4;
        if (frame.data[at + 3] < alphaThreshold) {
          indices[i] = 255; // временная метка прозрачности, чинится ниже
          continue;
        }
        const r = (frame.data[at] >> shift) << shift;
        const g = (frame.data[at + 1] >> shift) << shift;
        const b = (frame.data[at + 2] >> shift) << shift;
        const key = (r << 16) | (g << 8) | b;
        let index = lookup.get(key);
        if (index === undefined) {
          if (rgb.length / 3 >= 255) {
            overflow = true;
            break;
          }
          index = rgb.length / 3;
          lookup.set(key, index);
          rgb.push(r, g, b);
        }
        indices[i] = index;
      }
      if (overflow) break;
      indexed.push(indices);
    }
    if (overflow) continue;

    const transparentIndex = rgb.length / 3;
    rgb.push(0, 0, 0);
    for (const indices of indexed) {
      for (let i = 0; i < indices.length; i++) {
        if (indices[i] === 255) indices[i] = transparentIndex;
      }
    }
    return { rgb, transparentIndex, frames: indexed };
  }
  throw new Error('GIF: не удалось построить палитру — слишком много цветов');
}

class BitWriter {
  private bytes: number[] = [];
  private current = 0;
  private bits = 0;

  write(code: number, size: number): void {
    this.current |= code << this.bits;
    this.bits += size;
    while (this.bits >= 8) {
      this.bytes.push(this.current & 0xff);
      this.current >>= 8;
      this.bits -= 8;
    }
  }

  finish(): number[] {
    if (this.bits > 0) {
      this.bytes.push(this.current & 0xff);
      this.current = 0;
      this.bits = 0;
    }
    return this.bytes;
  }
}

/** LZW-сжатие индексов по правилам GIF. Возвращает поток без разбиения на подблоки. */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const writer = new BitWriter();
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  let dict = new Map<number, number>();

  writer.write(clearCode, codeSize);
  if (indices.length === 0) {
    writer.write(eoiCode, codeSize);
    return writer.finish();
  }

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    writer.write(prefix, codeSize);
    if (nextCode < 4096) {
      dict.set(key, nextCode);
      nextCode++;
      if (nextCode >= 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      writer.write(clearCode, codeSize);
      dict = new Map();
      codeSize = minCodeSize + 1;
      nextCode = eoiCode + 1;
    }
    prefix = k;
  }
  writer.write(prefix, codeSize);
  writer.write(eoiCode, codeSize);
  return writer.finish();
}

function pushSubBlocks(out: number[], data: number[]): void {
  for (let at = 0; at < data.length; at += 255) {
    const slice = data.slice(at, at + 255);
    out.push(slice.length, ...slice);
  }
  out.push(0);
}

function pushString(out: number[], value: string): void {
  for (let i = 0; i < value.length; i++) out.push(value.charCodeAt(i));
}

function pushShort(out: number[], value: number): void {
  out.push(value & 0xff, (value >> 8) & 0xff);
}

/** Собирает анимированный GIF из кадров одинакового размера. */
export function encodeGif(frames: RgbaImage[], options: GifOptions = {}): Uint8Array {
  if (frames.length === 0) throw new RangeError('GIF: нужен хотя бы один кадр');
  const { width, height } = frames[0];
  if (width <= 0 || height <= 0) throw new RangeError('GIF: некорректный размер кадра');
  for (const frame of frames) {
    if (frame.width !== width || frame.height !== height) {
      throw new RangeError('GIF: все кадры должны быть одного размера');
    }
  }

  const alphaThreshold = options.alphaThreshold ?? 128;
  const palette = quantize(frames, alphaThreshold);
  const colorCount = palette.rgb.length / 3;
  let paletteBits = 2; // минимум для LZW с кодом длиной 2 бита
  while (1 << paletteBits < colorCount) paletteBits++;
  const paletteSize = 1 << paletteBits;

  const delays = Array.isArray(options.delayMs)
    ? options.delayMs
    : new Array(frames.length).fill(options.delayMs ?? 100);
  const loop = options.loop ?? 0;

  const out: number[] = [];
  pushString(out, 'GIF89a');
  pushShort(out, width);
  pushShort(out, height);
  out.push(0x80 | ((paletteBits - 1) & 0x07)); // глобальная палитра
  out.push(0); // индекс фона
  out.push(0); // соотношение сторон

  for (let i = 0; i < paletteSize; i++) {
    out.push(palette.rgb[i * 3] ?? 0, palette.rgb[i * 3 + 1] ?? 0, palette.rgb[i * 3 + 2] ?? 0);
  }

  if (frames.length > 1) {
    out.push(0x21, 0xff, 11);
    pushString(out, 'NETSCAPE2.0');
    out.push(3, 1);
    pushShort(out, loop);
    out.push(0);
  }

  const minCodeSize = Math.max(2, paletteBits);
  frames.forEach((_, index) => {
    const delayCs = Math.max(1, Math.round((delays[index] ?? 100) / 10));
    out.push(0x21, 0xf9, 4);
    out.push(0x08 | (palette.transparentIndex >= 0 ? 1 : 0)); // disposal: восстановить фон
    pushShort(out, delayCs);
    out.push(palette.transparentIndex >= 0 ? palette.transparentIndex : 0);
    out.push(0);

    out.push(0x2c);
    pushShort(out, 0);
    pushShort(out, 0);
    pushShort(out, width);
    pushShort(out, height);
    out.push(0); // без локальной палитры и чересстрочности

    out.push(minCodeSize);
    pushSubBlocks(out, lzwEncode(palette.frames[index], minCodeSize));
  });

  out.push(0x3b);
  return Uint8Array.from(out);
}
