import { describe, expect, it } from 'vitest';
import {
  MAX_CANVAS_SIZE,
  clampCanvasSize,
  countPainted,
  createTexture,
  drawLine,
  drawRect,
  fillArea,
  normalizeTexture,
  replaceColor,
  resizeTexture,
  setPixel,
  shiftTexture,
  texturePalette,
  textureSize,
} from './texture';
import { PixelmationFormatError } from './types';

describe('texture', () => {
  it('создаёт пустой холст заданного размера', () => {
    const texture = createTexture(4, 3, 'герой');
    expect(textureSize(texture)).toEqual({ width: 4, height: 3 });
    expect(countPainted(texture)).toBe(0);
    expect(texture.name).toBe('герой');
  });

  it('ограничивает размер холста', () => {
    expect(clampCanvasSize(0)).toBe(1);
    expect(clampCanvasSize(9999)).toBe(MAX_CANVAS_SIZE);
    expect(clampCanvasSize(32.7)).toBe(32);
  });

  it('ставит пиксель и нормализует цвет', () => {
    const texture = setPixel(createTexture(2, 2), 1, 0, '#f00');
    expect(texture.cells[0][1]).toBe('#ff0000ff');
    expect(setPixel(texture, 1, 0, 'transparent').cells[0][1]).toBeNull();
  });

  it('рисует линию и прямоугольник', () => {
    const line = drawLine(createTexture(4, 4), { x: 0, y: 0 }, { x: 3, y: 0 }, '#fff');
    expect(countPainted(line)).toBe(4);
    const rect = drawRect(createTexture(4, 4), { x: 0, y: 0 }, { x: 3, y: 3 }, '#fff', true);
    expect(countPainted(rect)).toBe(16);
  });

  it('заливает связную область', () => {
    let texture = createTexture(3, 1);
    texture = setPixel(texture, 1, 0, '#000');
    texture = fillArea(texture, 0, 0, '#f00');
    expect(texture.cells[0][0]).toBe('#ff0000ff');
    expect(texture.cells[0][1]).toBe('#000000ff');
    expect(texture.cells[0][2]).toBeNull();
  });

  it('сдвигает рисунок', () => {
    const texture = shiftTexture(setPixel(createTexture(3, 1), 0, 0, '#fff'), 2, 0);
    expect(texture.cells[0][2]).toBe('#ffffffff');
    expect(texture.cells[0][0]).toBeNull();
  });

  it('меняет размер холста', () => {
    const texture = resizeTexture(setPixel(createTexture(2, 2), 0, 0, '#fff'), 4, 4);
    expect(textureSize(texture)).toEqual({ width: 4, height: 4 });
    expect(texture.cells[0][0]).toBe('#ffffffff');
  });

  it('считает палитру по частоте', () => {
    let texture = createTexture(3, 1);
    texture = setPixel(texture, 0, 0, '#f00');
    texture = setPixel(texture, 1, 0, '#f00');
    texture = setPixel(texture, 2, 0, '#0f0');
    expect(texturePalette(texture)).toEqual([
      { color: '#ff0000ff', count: 2 },
      { color: '#00ff00ff', count: 1 },
    ]);
  });

  it('заменяет цвет по всему холсту', () => {
    const texture = replaceColor(setPixel(createTexture(2, 1), 0, 0, '#f00'), '#f00', '#00f');
    expect(texture.cells[0][0]).toBe('#0000ffff');
  });

  it('отклоняет неровные клетки', () => {
    expect(() => normalizeTexture({ name: '', cells: [[null], [null, null]] })).toThrow(
      PixelmationFormatError,
    );
  });
});
