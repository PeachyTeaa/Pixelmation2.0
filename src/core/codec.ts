/**
 * Чтение и запись форматов проекта.
 *
 * `.pxlmt` — текстура:   `{ "name": string, "cells": (string|null)[][] }`
 * `.pxlma` — анимация:   `{ "name": string, "slides": ({x,y}|null)[][][], "texture": pxlmt }`
 *
 * Дополнительно понимается legacy-формат Pixelmation 1.x, где `cells` и `slides`
 * были RLE-строками, а ссылки хранились с переставленными осями (`x` = строка).
 */
import { normalizeColor } from './color';
import { normalizeAnimation, sanitizeAnimation } from './animation';
import { isRectangular } from './grid';
import { normalizeTexture } from './texture';
import {
  PixelmationFormatError,
  type Animation,
  type Point,
  type Slide,
  type SlideCell,
  type Texture,
  type TextureCells,
} from './types';

/** Расширение файла текстуры. */
export const TEXTURE_EXT = '.pxlmt';
/** Расширение файла анимации. */
export const ANIMATION_EXT = '.pxlma';

/* ------------------------------------------------------------------ *
 * legacy RLE (Pixelmation 1.x)
 * ------------------------------------------------------------------ */

function decodeLegacyRows(packed: string): string[][] {
  if (typeof packed !== 'string' || packed.length === 0) {
    throw new PixelmationFormatError('Пустая legacy-строка клеток');
  }
  const rows: string[][] = [];
  for (const chunk of packed.split(';')) {
    if (chunk === '') continue;
    const [countRaw, rowRaw = ''] = splitOnce(chunk, '=');
    const count = Number(countRaw);
    if (!Number.isFinite(count) || count <= 0) {
      throw new PixelmationFormatError(`Некорректный повтор строки в legacy-данных: ${chunk}`);
    }
    const row: string[] = [];
    for (const cellChunk of rowRaw.split(',')) {
      if (cellChunk === '') continue;
      const [cellCountRaw, valueRaw = ''] = splitOnce(cellChunk, '.');
      const cellCount = Number(cellCountRaw);
      if (!Number.isFinite(cellCount) || cellCount <= 0) {
        throw new PixelmationFormatError(`Некорректный повтор клетки в legacy-данных: ${cellChunk}`);
      }
      for (let i = 0; i < cellCount; i++) row.push(valueRaw);
    }
    for (let i = 0; i < count; i++) rows.push(row.slice());
  }
  if (rows.length === 0) throw new PixelmationFormatError('Legacy-данные не содержат строк');
  return rows;
}

function splitOnce(value: string, separator: string): [string, string] {
  const at = value.indexOf(separator);
  if (at === -1) return [value, ''];
  return [value.slice(0, at), value.slice(at + separator.length)];
}

function encodeLegacyRows(rows: string[][]): string {
  const packedRows = rows.map((row) => {
    const parts: string[] = [];
    let current = row[0];
    let count = 0;
    for (const value of row) {
      if (value === current) {
        count++;
      } else {
        parts.push(`${count}.${current}`);
        current = value;
        count = 1;
      }
    }
    if (count > 0) parts.push(`${count}.${current}`);
    return parts.join(',');
  });

  const parts: string[] = [];
  let current = packedRows[0];
  let count = 0;
  for (const row of packedRows) {
    if (row === current) {
      count++;
    } else {
      parts.push(`${count}=${current}`);
      current = row;
      count = 1;
    }
  }
  if (count > 0) parts.push(`${count}=${current}`);
  return parts.join(';');
}

function decodeLegacySlides(packed: string): string[][][] {
  const slides: string[][][] = [];
  for (const chunk of packed.split('+')) {
    if (chunk === '') continue;
    const [countRaw, slideRaw = ''] = splitOnce(chunk, '!');
    const count = Number(countRaw);
    if (!Number.isFinite(count) || count <= 0) {
      throw new PixelmationFormatError(`Некорректный повтор слайда в legacy-данных: ${chunk}`);
    }
    const slide = decodeLegacyRows(slideRaw);
    for (let i = 0; i < count; i++) slides.push(slide.map((row) => row.slice()));
  }
  if (slides.length === 0) throw new PixelmationFormatError('Legacy-анимация не содержит слайдов');
  return slides;
}

function encodeLegacySlides(slides: Slide[]): string {
  const packed = slides.map((slide) =>
    encodeLegacyRows(slide.map((row) => row.map((ref) => (ref === null ? 'null' : `${ref.y}-${ref.x}`)))),
  );
  const parts: string[] = [];
  let current = packed[0];
  let count = 0;
  for (const slide of packed) {
    if (slide === current) {
      count++;
    } else {
      parts.push(`${count}!${current}`);
      current = slide;
      count = 1;
    }
  }
  if (count > 0) parts.push(`${count}!${current}`);
  return parts.join('+');
}

/** Legacy-ссылка `"строка-столбец"` → современная точка `{x: столбец, y: строка}`. */
function parseLegacyRef(value: string): SlideCell {
  if (value === 'null' || value === '' || value === 'undefined') return null;
  const [rowRaw, colRaw] = value.split('-');
  const row = Number(rowRaw);
  const col = Number(colRaw);
  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    throw new PixelmationFormatError(`Некорректная ссылка на пиксель: ${value}`);
  }
  return { x: col, y: row };
}

/* ------------------------------------------------------------------ *
 * общие помощники
 * ------------------------------------------------------------------ */

function asObject(input: unknown, what: string): Record<string, unknown> {
  const data = typeof input === 'string' ? safeParseJson(input, what) : input;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new PixelmationFormatError(`${what}: ожидался JSON-объект`);
  }
  return data as Record<string, unknown>;
}

function safeParseJson(input: string, what: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new PixelmationFormatError(
      `${what}: файл не является корректным JSON (${(error as Error).message})`,
    );
  }
}

function readName(data: Record<string, unknown>): string {
  const name = data.name;
  return typeof name === 'string' ? name : '';
}

function toCells(raw: unknown, what: string): TextureCells {
  if (typeof raw === 'string') {
    return decodeLegacyRows(raw).map((row) => row.map((value) => normalizeColor(value)));
  }
  if (!Array.isArray(raw)) {
    throw new PixelmationFormatError(`${what}: поле cells должно быть массивом строк или строкой`);
  }
  const cells = raw.map((row) => {
    if (!Array.isArray(row)) {
      throw new PixelmationFormatError(`${what}: каждая строка cells должна быть массивом`);
    }
    return row.map((value) => normalizeColor(value));
  });
  if (!isRectangular(cells)) {
    throw new PixelmationFormatError(`${what}: строки cells имеют разную длину`);
  }
  return cells as TextureCells;
}

function toSlideCell(raw: unknown, what: string): SlideCell {
  if (raw === null || raw === undefined || raw === 'null') return null;
  if (typeof raw === 'string') return parseLegacyRef(raw);
  if (Array.isArray(raw) && raw.length === 2) {
    const [x, y] = raw as [unknown, unknown];
    if (Number.isInteger(x) && Number.isInteger(y)) return { x: x as number, y: y as number };
  }
  if (typeof raw === 'object') {
    const point = raw as Partial<Point>;
    if (Number.isInteger(point.x) && Number.isInteger(point.y)) {
      return { x: point.x as number, y: point.y as number };
    }
  }
  throw new PixelmationFormatError(`${what}: некорректная ссылка на пиксель текстуры`);
}

/* ------------------------------------------------------------------ *
 * публичный API
 * ------------------------------------------------------------------ */

/** Опции сериализации. */
export interface SerializeOptions {
  /** Писать в legacy-формате Pixelmation 1.x (RLE-строки). */
  legacy?: boolean;
  /** Форматировать JSON с отступами. */
  pretty?: boolean;
}

/** Разбирает содержимое `.pxlmt` (строку или уже распарсенный объект). */
export function parseTexture(input: unknown): Texture {
  const data = asObject(input, 'Текстура');
  if (!('cells' in data)) {
    throw new PixelmationFormatError('Текстура: отсутствует поле cells');
  }
  return normalizeTexture({ name: readName(data), cells: toCells(data.cells, 'Текстура') });
}

/** Сериализует текстуру в JSON. */
export function serializeTexture(texture: Texture, options: SerializeOptions = {}): string {
  const normalized = normalizeTexture(texture);
  const payload = options.legacy
    ? {
        name: normalized.name,
        cells: encodeLegacyRows(normalized.cells.map((row) => row.map((cell) => cell ?? 'null'))),
      }
    : { name: normalized.name, cells: normalized.cells };
  return JSON.stringify(payload, null, options.pretty ? 2 : 0);
}

/** Разбирает содержимое `.pxlma`. */
export function parseAnimation(input: unknown): Animation {
  const data = asObject(input, 'Анимация');
  if (!('texture' in data)) {
    throw new PixelmationFormatError('Анимация: отсутствует поле texture');
  }
  const texture = parseTexture(data.texture);
  const rawSlides = data.slides;

  let slides: Slide[];
  if (typeof rawSlides === 'string') {
    slides = decodeLegacySlides(rawSlides).map((slide) =>
      slide.map((row) => row.map((value) => parseLegacyRef(value))),
    );
  } else if (Array.isArray(rawSlides)) {
    slides = rawSlides.map((slide) => {
      if (!Array.isArray(slide)) {
        throw new PixelmationFormatError('Анимация: каждый слайд должен быть массивом строк');
      }
      return slide.map((row) => {
        if (!Array.isArray(row)) {
          throw new PixelmationFormatError('Анимация: каждая строка слайда должна быть массивом');
        }
        return row.map((value) => toSlideCell(value, 'Анимация'));
      });
    });
  } else {
    throw new PixelmationFormatError('Анимация: поле slides должно быть массивом или строкой');
  }

  return normalizeAnimation({ name: readName(data), slides, texture });
}

/** Сериализует анимацию в JSON. */
export function serializeAnimation(animation: Animation, options: SerializeOptions = {}): string {
  const normalized = sanitizeAnimation(animation);
  const payload = options.legacy
    ? {
        name: normalized.name,
        slides: encodeLegacySlides(normalized.slides),
        texture: {
          name: normalized.texture.name,
          cells: encodeLegacyRows(
            normalized.texture.cells.map((row) => row.map((cell) => cell ?? 'null')),
          ),
        },
      }
    : {
        name: normalized.name,
        slides: normalized.slides,
        texture: { name: normalized.texture.name, cells: normalized.texture.cells },
      };
  return JSON.stringify(payload, null, options.pretty ? 2 : 0);
}

/** Тип файла по имени. */
export function detectFileKind(fileName: string): 'texture' | 'animation' | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(TEXTURE_EXT)) return 'texture';
  if (lower.endsWith(ANIMATION_EXT)) return 'animation';
  return null;
}

/** Разбирает файл, определяя тип по имени, а при незнакомом расширении — по содержимому. */
export function parseProjectFile(
  fileName: string,
  content: string,
): { kind: 'texture'; texture: Texture } | { kind: 'animation'; animation: Animation } {
  const kind = detectFileKind(fileName);
  if (kind === 'texture') return { kind, texture: parseTexture(content) };
  if (kind === 'animation') return { kind, animation: parseAnimation(content) };

  const data = asObject(content, 'Файл');
  if ('slides' in data) return { kind: 'animation', animation: parseAnimation(data) };
  if ('cells' in data) return { kind: 'texture', texture: parseTexture(data) };
  throw new PixelmationFormatError(
    `Не удалось определить тип файла «${fileName}»: нужен ${TEXTURE_EXT} или ${ANIMATION_EXT}`,
  );
}

/** Приводит имя к безопасному имени файла. */
export function toFileName(name: string, extension: string): string {
  const clean = name.trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ');
  const base = clean.length > 0 ? clean : 'untitled';
  return base.toLowerCase().endsWith(extension) ? base : base + extension;
}
