import { describe, expect, it } from 'vitest';
import { asciiPreview, asciiPreviewWithRulers, formatLegend } from './ascii';
import type { TextureCells } from './types';

const cells: TextureCells = [
  ['#ff0000ff', '#ff0000ff', null],
  [null, '#00ff00ff', null],
];

describe('asciiPreview', () => {
  it('рисует холст символами и строит легенду', () => {
    const preview = asciiPreview(cells);
    expect(preview.width).toBe(3);
    expect(preview.height).toBe(2);
    expect(preview.rows).toEqual(['00.', '.1.']);
    expect(preview.legend).toEqual([
      { symbol: '0', color: '#ff0000ff', count: 2 },
      { symbol: '1', color: '#00ff00ff', count: 1 },
    ]);
  });

  it('пустой холст — одни точки', () => {
    const preview = asciiPreview([[null, null]]);
    expect(preview.text).toBe('..');
    expect(formatLegend(preview.legend)).toBe('холст пуст');
  });

  it('добавляет линейки координат', () => {
    const text = asciiPreviewWithRulers(cells);
    const lines = text.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[1].trim()).toBe('012');
    expect(lines[2]).toBe('0 00.');
  });
});
