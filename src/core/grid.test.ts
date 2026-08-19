import { describe, expect, it } from 'vitest';
import {
  createGrid,
  ellipsePoints,
  floodFill,
  gridSize,
  isRectangular,
  linePoints,
  rectPoints,
  resizeGrid,
  setCell,
  setCells,
  shiftGrid,
} from './grid';

const emptyString = () => '.';

describe('grid', () => {
  it('создаёт сетку нужного размера', () => {
    const grid = createGrid(3, 2, emptyString);
    expect(gridSize(grid)).toEqual({ width: 3, height: 2 });
    expect(isRectangular(grid)).toBe(true);
  });

  it('setCell не трогает исходную сетку и переиспользует нетронутые строки', () => {
    const grid = createGrid(2, 2, emptyString);
    const next = setCell(grid, 1, 0, 'x');
    expect(grid[0][1]).toBe('.');
    expect(next[0][1]).toBe('x');
    expect(next[1]).toBe(grid[1]);
  });

  it('setCell игнорирует выход за границы', () => {
    const grid = createGrid(2, 2, emptyString);
    expect(setCell(grid, 5, 5, 'x')).toBe(grid);
  });

  it('setCells меняет несколько клеток за раз', () => {
    const grid = createGrid(3, 3, emptyString);
    const next = setCells(grid, [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 9, y: 9 }], '#');
    expect(next[0][0]).toBe('#');
    expect(next[2][2]).toBe('#');
    expect(next[1][1]).toBe('.');
  });
});

describe('фигуры', () => {
  it('рисует прямую по Брезенхэму', () => {
    expect(linePoints(0, 0, 3, 0)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(linePoints(0, 0, 2, 2)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
    expect(linePoints(1, 1, 1, 1)).toEqual([{ x: 1, y: 1 }]);
  });

  it('строит контур и заливку прямоугольника', () => {
    expect(rectPoints(0, 0, 2, 2, false)).toHaveLength(8);
    expect(rectPoints(0, 0, 2, 2, true)).toHaveLength(9);
  });

  it('строит эллипс внутри рамки', () => {
    const filled = ellipsePoints(0, 0, 4, 4, true);
    expect(filled.length).toBeGreaterThan(0);
    expect(filled.every((p) => p.x >= 0 && p.x <= 4 && p.y >= 0 && p.y <= 4)).toBe(true);
    expect(ellipsePoints(0, 0, 4, 4, false).length).toBeLessThan(filled.length);
  });
});

describe('заливка и сдвиг', () => {
  it('заливает только связную область', () => {
    const grid = [
      ['.', '.', '#'],
      ['.', '#', '.'],
      ['#', '.', '.'],
    ];
    const filled = floodFill(grid, 0, 0, 'o');
    expect(filled[0][0]).toBe('o');
    expect(filled[0][1]).toBe('o');
    expect(filled[1][0]).toBe('o');
    expect(filled[2][2]).toBe('.');
    expect(filled[1][1]).toBe('#');
  });

  it('сдвигает содержимое, теряя уехавшее за край', () => {
    const grid = [
      ['a', 'b'],
      ['c', 'd'],
    ];
    const shifted = shiftGrid(grid, 1, 0, emptyString);
    expect(shifted).toEqual([
      ['.', 'a'],
      ['.', 'c'],
    ]);
  });

  it('умеет закольцовывать сдвиг', () => {
    const grid = [
      ['a', 'b'],
      ['c', 'd'],
    ];
    expect(shiftGrid(grid, 1, 0, emptyString, true)).toEqual([
      ['b', 'a'],
      ['d', 'c'],
    ]);
  });

  it('меняет размер, оставляя содержимое в левом верхнем углу', () => {
    const grid = [
      ['a', 'b'],
      ['c', 'd'],
    ];
    expect(resizeGrid(grid, 3, 1, emptyString)).toEqual([['a', 'b', '.']]);
  });
});
