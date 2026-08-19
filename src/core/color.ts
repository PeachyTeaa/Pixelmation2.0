import { PixelmationFormatError, type Cell, type HexColor, type Rgba } from './types';

const HEX_RE = /^#([0-9a-f]{3,8})$/i;
const RGB_RE = /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*(?:[,/]\s*([\d.%]+)\s*)?\)$/i;

const clamp255 = (n: number): number => (n < 0 ? 0 : n > 255 ? 255 : Math.round(n));
const hex2 = (n: number): string => clamp255(n).toString(16).padStart(2, '0');

/** Слова, которыми в файлах первой версии обозначалась пустая клетка. */
const EMPTY_WORDS = new Set(['', 'null', 'undefined', 'none', 'transparent']);

/** Разбирает цвет в компоненты. `null` — если это «пусто». Бросает ошибку на мусоре. */
export function parseColor(input: unknown): Rgba | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'string') {
    throw new PixelmationFormatError(`Цвет должен быть строкой или null, получено: ${typeof input}`);
  }
  const value = input.trim().toLowerCase();
  if (EMPTY_WORDS.has(value)) return null;

  const hex = HEX_RE.exec(value);
  if (hex) {
    const body = hex[1];
    if (body.length === 3 || body.length === 4) {
      const [r, g, b, a = 'f'] = body.split('');
      return {
        r: parseInt(r + r, 16),
        g: parseInt(g + g, 16),
        b: parseInt(b + b, 16),
        a: parseInt(a + a, 16),
      };
    }
    if (body.length === 6 || body.length === 8) {
      return {
        r: parseInt(body.slice(0, 2), 16),
        g: parseInt(body.slice(2, 4), 16),
        b: parseInt(body.slice(4, 6), 16),
        a: body.length === 8 ? parseInt(body.slice(6, 8), 16) : 255,
      };
    }
    throw new PixelmationFormatError(`Некорректный HEX-цвет: ${input}`);
  }

  const rgb = RGB_RE.exec(value);
  if (rgb) {
    const alphaRaw = rgb[4];
    let a = 255;
    if (alphaRaw !== undefined) {
      a = alphaRaw.endsWith('%')
        ? (parseFloat(alphaRaw) / 100) * 255
        : parseFloat(alphaRaw) * 255;
    }
    return { r: clamp255(+rgb[1]), g: clamp255(+rgb[2]), b: clamp255(+rgb[3]), a: clamp255(a) };
  }

  throw new PixelmationFormatError(`Не удалось разобрать цвет: ${input}`);
}

/** Собирает `#rrggbbaa` из компонентов. */
export function rgbaToHex({ r, g, b, a }: Rgba): HexColor {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a)}`;
}

/**
 * Приводит любой поддерживаемый вход к канонической клетке.
 * Полностью прозрачный цвет всегда становится `null` — «если цвета нет, это всегда null».
 */
export function normalizeColor(input: unknown): Cell {
  const rgba = parseColor(input);
  if (rgba === null || rgba.a === 0) return null;
  return rgbaToHex(rgba);
}

/** Значение альфы (0..255) у клетки. */
export function alphaOf(cell: Cell): number {
  if (cell === null) return 0;
  return parseColor(cell)?.a ?? 0;
}

/** Заменяет альфу, сохраняя RGB. Альфа 0 превращает цвет в `null`. */
export function withAlpha(cell: Cell, alpha: number): Cell {
  const rgba = cell === null ? { r: 0, g: 0, b: 0, a: 0 } : parseColor(cell);
  if (!rgba) return null;
  return normalizeColor(rgbaToHex({ ...rgba, a: clamp255(alpha) }));
}

/** `#rrggbb` без альфы — для `<input type="color">`. */
export function toRgbHex(cell: Cell): string {
  const rgba = cell === null ? null : parseColor(cell);
  if (!rgba) return '#000000';
  return `#${hex2(rgba.r)}${hex2(rgba.g)}${hex2(rgba.b)}`;
}

/** CSS-значение клетки: `transparent` для пустой. */
export function toCssColor(cell: Cell): string {
  return cell === null ? 'transparent' : cell;
}

/** Сравнение клеток с учётом канонизации. */
export function colorEquals(a: Cell, b: Cell): boolean {
  return normalizeColor(a) === normalizeColor(b);
}

/** Наложение цвета на непрозрачный фон (source-over). Возвращает непрозрачный цвет. */
export function blendOver(fg: Cell, bg: Rgba): Rgba {
  const src = fg === null ? null : parseColor(fg);
  if (!src || src.a === 0) return { ...bg, a: 255 };
  const alpha = src.a / 255;
  return {
    r: clamp255(src.r * alpha + bg.r * (1 - alpha)),
    g: clamp255(src.g * alpha + bg.g * (1 - alpha)),
    b: clamp255(src.b * alpha + bg.b * (1 - alpha)),
    a: 255,
  };
}

/** Случайный вспомогательный цвет — используется в тестах и генераторах палитр. */
export function randomColor(rand: () => number = Math.random): HexColor {
  return rgbaToHex({
    r: Math.floor(rand() * 256),
    g: Math.floor(rand() * 256),
    b: Math.floor(rand() * 256),
    a: 255,
  });
}
