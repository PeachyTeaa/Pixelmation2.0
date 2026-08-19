#!/usr/bin/env tsx
/**
 * `pxl` — командная строка Pixelmation.
 *
 * Инструмент для работы без интерфейса: создать файл, порисовать, посмотреть
 * холст текстом, отрендерить PNG или собрать GIF. Ядро то же, что и в вебе.
 *
 * Запуск: `npm run pxl -- <команда> [аргументы]`
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { basename } from 'node:path';
import {
  addSlide,
  ansiPreview,
  asciiPreview,
  asciiPreviewWithRulers,
  clearTexture,
  countPainted,
  countPaintedRefs,
  createAnimation,
  createSlide,
  createTexture,
  deleteSlide,
  duplicateSlide,
  ensureColorRef,
  ellipsePoints,
  encodeGif,
  encodePng,
  fillArea,
  floodFill,
  formatLegend,
  gridSize,
  insertTextureAsSlide,
  linePoints,
  moveSlide,
  normalizeColor,
  parseAnimation,
  parseTexture,
  rectPoints,
  refEquals,
  renderAnimation,
  renderCells,
  resolveSlide,
  serializeAnimation,
  serializeTexture,
  setCells,
  setPixels,
  shiftGrid,
  shiftTexture,
  textureSize,
  type Animation,
  type Cell,
  type Point,
  type Slide,
  type SlideCell,
  type Texture,
  type TextureCells,
} from '../src/core/index.ts';

const HELP = `pxl — Pixelmation в командной строке

  pxl new texture <файл.pxlmt> <ширина> <высота> [--name имя]
  pxl new animation <файл.pxlma> <ширина> <высота> [--name имя]

  pxl info <файл>                        размер, палитра, число кадров
  pxl show <файл> [--slide n] [--rulers] [--ansi]
  pxl render <файл> <out.png> [--scale 8] [--slide n] [--bg "#0b0e14"]
  pxl gif <файл.pxlma> <out.gif> [--scale 8] [--delay 200] [--bg цвет]

  pxl draw <файл> [--slide n] операции…
      --pixel x,y,цвет             один пиксель ("null" — стереть)
      --line x0,y0,x1,y1,цвет      отрезок
      --rect x0,y0,x1,y1,цвет[,fill]
      --ellipse x0,y0,x1,y1,цвет[,fill]
      --fill x,y,цвет              заливка связной области
      --shift dx,dy[,wrap]         сдвинуть рисунок
      --clear                      очистить холст
      --ascii "..#|.#.|#.." --legend "#=#ff0000ff,.=null" [--x 0] [--y 0]
      В анимации можно указать и цвет, и пиксель текстуры ("x:y"), и "null":
      цвет сам займёт свободную клетку текстуры, если его там ещё нет.

  pxl slides <файл.pxlma> add|copy|delete|move|texture [--index n] [--to n]
  pxl convert <вход> <выход> [--legacy]  пересохранить, в том числе в формат 1.x

Цвета: #rgb, #rrggbb, #rrggbbaa, rgba(...), "null" — прозрачность.
Нумерация кадров в аргументах — с единицы, координаты — с нуля.`;

type Flags = Record<string, string | boolean>;

interface ParsedArgs {
  positional: string[];
  flags: Flags;
  /** Операции рисования в том порядке, в каком их написали. */
  ops: Array<{ name: string; value: string }>;
}

type Document = { kind: 'texture'; texture: Texture } | { kind: 'animation'; animation: Animation };

const DRAW_OPS = new Set(['pixel', 'line', 'rect', 'ellipse', 'fill', 'shift', 'clear', 'ascii']);

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Flags = {};
  const ops: ParsedArgs['ops'] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[i + 1];
    const takesValue = next !== undefined && !next.startsWith('--');
    const value = takesValue ? next : '';
    if (takesValue) i++;
    if (DRAW_OPS.has(name)) ops.push({ name, value });
    else flags[name] = takesValue ? value : true;
  }
  return { positional, flags, ops };
}

function fail(message: string): never {
  console.error(`Ошибка: ${message}`);
  process.exit(1);
}

function readDocument(path: string): Document {
  const content = readFileSync(path, 'utf8');
  if (path.toLowerCase().endsWith('.pxlma')) return { kind: 'animation', animation: parseAnimation(content) };
  if (path.toLowerCase().endsWith('.pxlmt')) return { kind: 'texture', texture: parseTexture(content) };
  const data = JSON.parse(content) as Record<string, unknown>;
  if ('slides' in data) return { kind: 'animation', animation: parseAnimation(data) };
  return { kind: 'texture', texture: parseTexture(data) };
}

function writeDocument(path: string, document: Document, legacy = false): void {
  const json =
    document.kind === 'texture'
      ? serializeTexture(document.texture, { pretty: true, legacy })
      : serializeAnimation(document.animation, { pretty: true, legacy });
  writeFileSync(path, json, 'utf8');
}

function numbers(value: string, count: number): number[] {
  const nums = value.split(',').slice(0, count).map(Number);
  if (nums.length < count || nums.some((n) => !Number.isFinite(n))) {
    fail(`Ожидалось ${count} чисел через запятую, получено «${value}»`);
  }
  return nums;
}


function slideNumber(flags: Flags): number {
  const raw = Number(flags.slide ?? 1);
  return Number.isFinite(raw) ? Math.max(0, raw - 1) : 0;
}

function previewOf(document: Document, slideIndex: number): TextureCells {
  if (document.kind === 'texture') return document.texture.cells;
  const slide = document.animation.slides[slideIndex];
  if (!slide) fail(`Кадра ${slideIndex + 1} нет`);
  return resolveSlide(slide, document.animation.texture);
}

function printCanvas(cells: TextureCells, rulers = false): void {
  console.log(rulers ? asciiPreviewWithRulers(cells) : asciiPreview(cells).text);
  console.log('');
  console.log(formatLegend(asciiPreview(cells).legend));
}

/* ------------------------------------------------------------------ *
 * команды
 * ------------------------------------------------------------------ */

function commandNew(args: ParsedArgs): void {
  const [, kind, path, widthRaw, heightRaw] = args.positional;
  if (!kind || !path || !widthRaw || !heightRaw) {
    fail('Нужно: pxl new texture|animation <файл> <ширина> <высота>');
  }
  const width = Number(widthRaw);
  const height = Number(heightRaw);
  const name =
    typeof args.flags.name === 'string' ? args.flags.name : basename(path).replace(/\.[^.]+$/, '');
  const texture = createTexture(width, height, name);

  if (kind === 'texture') writeDocument(path, { kind: 'texture', texture });
  else if (kind === 'animation') {
    writeDocument(path, { kind: 'animation', animation: createAnimation(texture, name) });
  } else fail('Тип документа: texture или animation');

  console.log(`Создано: ${path} — ${width}×${height}`);
}

function commandInfo(args: ParsedArgs): void {
  const path = args.positional[1];
  if (!path) fail('Нужно: pxl info <файл>');
  const document = readDocument(path);

  if (document.kind === 'texture') {
    const size = textureSize(document.texture);
    console.log(`Текстура «${document.texture.name}» — ${size.width}×${size.height}`);
    console.log(`Закрашено ${countPainted(document.texture)} из ${size.width * size.height}`);
    console.log(formatLegend(asciiPreview(document.texture.cells).legend));
    return;
  }

  const { animation } = document;
  const size = textureSize(animation.texture);
  console.log(
    `Анимация «${animation.name}» — ${size.width}×${size.height}, кадров: ${animation.slides.length}`,
  );
  animation.slides.forEach((slide, index) => {
    console.log(`  кадр ${index + 1}: ${countPaintedRefs(slide)} пикселей`);
  });
  console.log(formatLegend(asciiPreview(animation.texture.cells).legend));
}

function commandShow(args: ParsedArgs): void {
  const path = args.positional[1];
  if (!path) fail('Нужно: pxl show <файл>');
  const cells = previewOf(readDocument(path), slideNumber(args.flags));
  if (args.flags.ansi) {
    console.log(ansiPreview(cells));
    return;
  }
  printCanvas(cells, Boolean(args.flags.rulers));
}

function commandRender(args: ParsedArgs): void {
  const [, path, out] = args.positional;
  if (!path || !out) fail('Нужно: pxl render <файл> <out.png>');
  const cells = previewOf(readDocument(path), slideNumber(args.flags));
  const scale = Number(args.flags.scale ?? 8);
  const background = typeof args.flags.bg === 'string' ? normalizeColor(args.flags.bg) : null;

  const image = renderCells(cells, { scale, background });
  writeFileSync(out, encodePng(image, (data) => deflateSync(data)));
  console.log(`PNG: ${out} — ${image.width}×${image.height}`);
}

function commandGif(args: ParsedArgs): void {
  const [, path, out] = args.positional;
  if (!path || !out) fail('Нужно: pxl gif <файл.pxlma> <out.gif>');
  const document = readDocument(path);
  if (document.kind !== 'animation') fail('GIF собирается только из анимации');

  const scale = Number(args.flags.scale ?? 8);
  const delayMs = Number(args.flags.delay ?? 200);
  const background = typeof args.flags.bg === 'string' ? normalizeColor(args.flags.bg) : null;

  const frames = renderAnimation(document.animation, { scale, background });
  writeFileSync(out, encodeGif(frames, { delayMs }));
  console.log(`GIF: ${out} — ${frames.length} кадров по ${delayMs} мс`);
}

function commandDraw(args: ParsedArgs): void {
  const path = args.positional[1];
  if (!path) fail('Нужно: pxl draw <файл> операции…');
  if (args.ops.length === 0) fail('Не указано ни одной операции рисования');

  const document = readDocument(path);
  const isAnimation = document.kind === 'animation';
  const slideIndex = slideNumber(args.flags);

  let texture = isAnimation ? document.animation.texture : document.texture;
  let slide: Slide | null = isAnimation ? (document.animation.slides[slideIndex] ?? null) : null;
  if (isAnimation && !slide) fail(`Кадра ${slideIndex + 1} нет`);

  /**
   * Значение операции. Для текстуры это цвет, для кадра — ссылка «x:y», «null»
   * или обычный цвет: тогда он ищется в текстуре, а при отсутствии занимает
   * первую свободную клетку.
   */
  const resolveValue = (raw: string): Cell | SlideCell => {
    const value = raw.trim();
    if (!slide) return normalizeColor(value === '' ? null : value);
    if (value === '' || value === 'null') return null;
    if (value.includes(':')) {
      const [x, y] = value.split(':').map(Number);
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        fail(`Ссылка на пиксель текстуры должна быть вида x:y, получено «${raw}»`);
      }
      return { x, y };
    }
    const found = ensureColorRef(texture, value);
    texture = found.texture;
    return found.ref;
  };

  const paint = (points: Point[], value: Cell | SlideCell): void => {
    if (slide) slide = setCells(slide, points, value as SlideCell);
    else texture = setPixels(texture, points, value as Cell);
  };

  for (const op of args.ops) {
    const parts = op.value.split(',');
    switch (op.name) {
      case 'pixel': {
        const [x, y] = numbers(op.value, 2);
        paint([{ x, y }], resolveValue(parts.slice(2).join(',')));
        break;
      }
      case 'line': {
        const [x0, y0, x1, y1] = numbers(op.value, 4);
        paint(linePoints(x0, y0, x1, y1), resolveValue(parts.slice(4).join(',')));
        break;
      }
      case 'rect':
      case 'ellipse': {
        const [x0, y0, x1, y1] = numbers(op.value, 4);
        const filled = parts.includes('fill');
        const value = resolveValue(parts.slice(4).filter((part) => part !== 'fill').join(','));
        const points =
          op.name === 'rect'
            ? rectPoints(x0, y0, x1, y1, filled)
            : ellipsePoints(x0, y0, x1, y1, filled);
        paint(points, value);
        break;
      }
      case 'fill': {
        const [x, y] = numbers(op.value, 2);
        const value = resolveValue(parts.slice(2).join(','));
        if (slide) slide = floodFill(slide, x, y, value as SlideCell, refEquals);
        else texture = fillArea(texture, x, y, value as Cell);
        break;
      }
      case 'shift': {
        const [dx, dy] = numbers(op.value, 2);
        const wrap = parts.includes('wrap');
        if (slide) slide = shiftGrid<SlideCell>(slide, dx, dy, () => null, wrap);
        else texture = shiftTexture(texture, dx, dy, wrap);
        break;
      }
      case 'clear': {
        if (slide) {
          const size = gridSize(slide);
          slide = createSlide(size.width, size.height);
        } else texture = clearTexture(texture);
        break;
      }
      case 'ascii': {
        const legendRaw = typeof args.flags.legend === 'string' ? args.flags.legend : '';
        const legend = new Map<string, string>();
        for (const pair of legendRaw.split(',')) {
          const at = pair.indexOf('=');
          if (at > 0) legend.set(pair.slice(0, at), pair.slice(at + 1));
        }
        if (legend.size === 0) fail('Для --ascii нужен --legend "символ=цвет,…"');

        const originX = Number(args.flags.x ?? 0);
        const originY = Number(args.flags.y ?? 0);
        const byValue = new Map<string, Point[]>();
        op.value.split('|').forEach((row, rowIndex) => {
          [...row].forEach((symbol, columnIndex) => {
            const raw = legend.get(symbol);
            if (raw === undefined) return;
            if (!byValue.has(raw)) byValue.set(raw, []);
            byValue.get(raw)!.push({ x: originX + columnIndex, y: originY + rowIndex });
          });
        });
        for (const [raw, points] of byValue) paint(points, resolveValue(raw));
        break;
      }
      default:
        fail(`Неизвестная операция: --${op.name}`);
    }
  }

  if (isAnimation && slide) {
    const slides = document.animation.slides.slice();
    slides[slideIndex] = slide;
    writeDocument(path, {
      kind: 'animation',
      animation: { ...document.animation, slides, texture },
    });
    printCanvas(resolveSlide(slide, texture));
    return;
  }

  writeDocument(path, { kind: 'texture', texture });
  printCanvas(texture.cells);
}

function commandSlides(args: ParsedArgs): void {
  const [, path, action] = args.positional;
  if (!path || !action) fail('Нужно: pxl slides <файл.pxlma> add|copy|delete|move|texture');
  const document = readDocument(path);
  if (document.kind !== 'animation') fail('Команда работает только с анимацией');

  const index = Math.max(0, Number(args.flags.index ?? document.animation.slides.length) - 1);
  let result: { animation: Animation; index: number };

  switch (action) {
    case 'add':
      result = addSlide(document.animation, index);
      break;
    case 'copy':
      result = duplicateSlide(document.animation, index);
      break;
    case 'delete':
      result = deleteSlide(document.animation, index);
      break;
    case 'texture':
      result = insertTextureAsSlide(document.animation, index);
      break;
    case 'move': {
      const to = Number(args.flags.to);
      if (!Number.isFinite(to)) fail('Для move нужен --to <номер>');
      result = moveSlide(document.animation, index, to - 1);
      break;
    }
    default:
      fail(`Неизвестное действие: ${action}`);
  }

  writeDocument(path, { kind: 'animation', animation: result.animation });
  console.log(`Готово: кадров ${result.animation.slides.length}, текущий ${result.index + 1}`);
}

function commandConvert(args: ParsedArgs): void {
  const [, input, output] = args.positional;
  if (!input || !output) fail('Нужно: pxl convert <вход> <выход>');
  writeDocument(output, readDocument(input), Boolean(args.flags.legacy));
  console.log(`Сохранено: ${output}${args.flags.legacy ? ' (формат 1.x)' : ''}`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positional[0];

  try {
    switch (command) {
      case 'new':
        commandNew(args);
        break;
      case 'info':
        commandInfo(args);
        break;
      case 'show':
        commandShow(args);
        break;
      case 'render':
        commandRender(args);
        break;
      case 'gif':
        commandGif(args);
        break;
      case 'draw':
        commandDraw(args);
        break;
      case 'slides':
        commandSlides(args);
        break;
      case 'convert':
        commandConvert(args);
        break;
      case 'help':
      case undefined:
        console.log(HELP);
        break;
      default:
        fail(`Неизвестная команда: ${command}\n\n${HELP}`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
