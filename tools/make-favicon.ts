#!/usr/bin/env tsx
/**
 * Сборка иконок сайта из `assets/favicon.pxlmt`.
 *
 * Иконка нарисована в самом Pixelmation, поэтому и собирается его же ядром:
 * SVG (пиксели прямоугольниками, масштабируется без мыла) и два PNG для
 * браузеров и мобильных экранов.
 *
 * Запуск: `npm run favicon`
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { encodePng, gridSize, parseTexture, renderCells, type TextureCells } from '../src/core/index.ts';

const SOURCE = 'assets/favicon.pxlmt';
const SVG_OUT = 'public/favicon.svg';
const PNG_OUT = 'public/favicon-96.png';
const TOUCH_OUT = 'public/apple-touch-icon.png';
/** Фон для иконки на домашнем экране: прозрачность там превращается в чёрный. */
const TOUCH_BACKGROUND = '#0b0e14ff';

/** Собирает соседние клетки одного цвета в один прямоугольник. */
function toRects(cells: TextureCells): string[] {
  const rects: string[] = [];
  cells.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const color = row[x];
      if (color === null) {
        x++;
        continue;
      }
      let end = x;
      while (end + 1 < row.length && row[end + 1] === color) end++;
      const width = end - x + 1;
      rects.push(
        `<rect x="${x}" y="${y}" width="${width}" height="1" fill="${color.slice(0, 7)}"${
          color.length === 9 && color.slice(7) !== 'ff'
            ? ` fill-opacity="${(parseInt(color.slice(7), 16) / 255).toFixed(3)}"`
            : ''
        }/>`,
      );
      x = end + 1;
    }
  });
  return rects;
}

function main(): void {
  const texture = parseTexture(readFileSync(SOURCE, 'utf8'));
  const { width, height } = gridSize(texture.cells);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`,
    `<title>Pixelmation</title>`,
    ...toRects(texture.cells),
    `</svg>`,
  ].join('');
  writeFileSync(SVG_OUT, `${svg}\n`, 'utf8');

  const icon = renderCells(texture.cells, { scale: 6 });
  writeFileSync(PNG_OUT, encodePng(icon, (data) => deflateSync(data)));

  const touch = renderCells(texture.cells, { scale: 12, background: TOUCH_BACKGROUND });
  writeFileSync(TOUCH_OUT, encodePng(touch, (data) => deflateSync(data)));

  console.log(`SVG: ${SVG_OUT} (${width}×${height})`);
  console.log(`PNG: ${PNG_OUT} (${icon.width}×${icon.height})`);
  console.log(`PNG: ${TOUCH_OUT} (${touch.width}×${touch.height})`);
}

main();
