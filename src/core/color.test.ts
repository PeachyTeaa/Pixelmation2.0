import { describe, expect, it } from 'vitest';
import { alphaOf, blendOver, normalizeColor, parseColor, toRgbHex, withAlpha } from './color';
import { PixelmationFormatError } from './types';

describe('normalizeColor', () => {
  it('приводит все формы записи к #rrggbbaa', () => {
    expect(normalizeColor('#f00')).toBe('#ff0000ff');
    expect(normalizeColor('#FF0000')).toBe('#ff0000ff');
    expect(normalizeColor('#ff000080')).toBe('#ff000080');
    expect(normalizeColor('rgb(255, 0, 0)')).toBe('#ff0000ff');
    expect(normalizeColor('rgba(255, 0, 0, 0.5)')).toBe('#ff000080');
  });

  it('любую пустоту превращает в null', () => {
    expect(normalizeColor(null)).toBeNull();
    expect(normalizeColor(undefined)).toBeNull();
    expect(normalizeColor('')).toBeNull();
    expect(normalizeColor('null')).toBeNull();
    expect(normalizeColor('transparent')).toBeNull();
    expect(normalizeColor('#00000000')).toBeNull();
    expect(normalizeColor('#12345600')).toBeNull();
  });

  it('ругается на мусор', () => {
    expect(() => normalizeColor('не цвет')).toThrow(PixelmationFormatError);
    expect(() => normalizeColor(42)).toThrow(PixelmationFormatError);
  });
});

describe('вспомогательные операции с цветом', () => {
  it('читает и меняет альфу', () => {
    expect(alphaOf('#ff000080')).toBe(128);
    expect(alphaOf(null)).toBe(0);
    expect(withAlpha('#ff0000ff', 128)).toBe('#ff000080');
    expect(withAlpha('#ff0000ff', 0)).toBeNull();
  });

  it('отдаёт rgb без альфы для input[type=color]', () => {
    expect(toRgbHex('#12345678')).toBe('#123456');
    expect(toRgbHex(null)).toBe('#000000');
  });

  it('накладывает полупрозрачный цвет на фон', () => {
    const result = blendOver('#ffffff80', { r: 0, g: 0, b: 0, a: 255 });
    expect(result.a).toBe(255);
    expect(result.r).toBeGreaterThan(120);
    expect(result.r).toBeLessThan(136);
  });

  it('разбирает цвет в компоненты', () => {
    expect(parseColor('#0080ff40')).toEqual({ r: 0, g: 128, b: 255, a: 64 });
  });
});
