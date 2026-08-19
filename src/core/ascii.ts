/**
 * Текстовое превью холста — так агент (и человек в терминале) «видит» рисунок
 * без графического интерфейса.
 */
import { parseColor } from './color';
import { gridSize } from './grid';
import type { HexColor, TextureCells } from './types';

const ESC = String.fromCharCode(27);
const SYMBOLS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Символ пустой (прозрачной) клетки. */
export const EMPTY_SYMBOL = '.';
/** Символ для цветов, которым не хватило места в легенде. */
export const OVERFLOW_SYMBOL = '?';

/** Строка легенды: какой символ какому цвету соответствует. */
export interface AsciiLegendEntry {
  symbol: string;
  color: HexColor;
  count: number;
}

/** Результат текстового превью. */
export interface AsciiPreview {
  width: number;
  height: number;
  /** Строки холста, по одному символу на пиксель. */
  rows: string[];
  /** Готовый многострочный текст (`rows`, склеенные переводом строки). */
  text: string;
  legend: AsciiLegendEntry[];
}

/** Строит текстовое превью сетки цветов. */
export function asciiPreview(cells: TextureCells): AsciiPreview {
  const { width, height } = gridSize(cells);
  const counts = new Map<HexColor, number>();
  for (const row of cells) {
    for (const cell of row) {
      if (cell === null) continue;
      counts.set(cell, (counts.get(cell) ?? 0) + 1);
    }
  }
  const ordered = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const symbolByColor = new Map<HexColor, string>();
  const legend: AsciiLegendEntry[] = [];
  ordered.forEach(([color, count], index) => {
    const symbol = index < SYMBOLS.length ? SYMBOLS[index] : OVERFLOW_SYMBOL;
    symbolByColor.set(color, symbol);
    legend.push({ symbol, color, count });
  });

  const rows = cells.map((row) =>
    row.map((cell) => (cell === null ? EMPTY_SYMBOL : symbolByColor.get(cell)!)).join(''),
  );

  return { width, height, rows, text: rows.join('\n'), legend };
}

/** То же превью, но с линейками координат — удобно целиться в конкретный пиксель. */
export function asciiPreviewWithRulers(cells: TextureCells): string {
  const preview = asciiPreview(cells);
  const digits = String(Math.max(preview.height - 1, 0)).length;
  const pad = ' '.repeat(digits + 1);
  const tens = Array.from({ length: preview.width }, (_, x) =>
    x % 10 === 0 ? String(Math.floor(x / 10) % 10) : ' ',
  ).join('');
  const ones = Array.from({ length: preview.width }, (_, x) => String(x % 10)).join('');
  const body = preview.rows.map((row, y) => `${String(y).padStart(digits)} ${row}`);
  return [`${pad}${tens}`, `${pad}${ones}`, ...body].join('\n');
}

/** Цветное превью для терминала: полублоки с truecolor-фоном. */
export function ansiPreview(cells: TextureCells): string {
  const { width, height } = gridSize(cells);
  const lines: string[] = [];
  for (let y = 0; y < height; y += 2) {
    let line = '';
    for (let x = 0; x < width; x++) {
      const top = cells[y]?.[x] ?? null;
      const bottom = y + 1 < height ? cells[y + 1][x] : null;
      const topRgb = top ? parseColor(top) : null;
      const bottomRgb = bottom ? parseColor(bottom) : null;
      if (!topRgb && !bottomRgb) {
        line += ' ';
        continue;
      }
      const fg = topRgb ? `${ESC}[38;2;${topRgb.r};${topRgb.g};${topRgb.b}m` : '';
      const bg = bottomRgb ? `${ESC}[48;2;${bottomRgb.r};${bottomRgb.g};${bottomRgb.b}m` : '';
      line += `${bg}${fg}▀${ESC}[0m`;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/** Легенда одной строкой на цвет — для вывода рядом с превью. */
export function formatLegend(legend: AsciiLegendEntry[]): string {
  if (legend.length === 0) return 'холст пуст';
  return legend.map(({ symbol, color, count }) => `${symbol} = ${color} (${count})`).join('\n');
}
