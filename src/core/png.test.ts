import { inflateSync, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePng, storedDeflate } from './png';
import { renderCells } from './render';
import type { TextureCells } from './types';

const cells: TextureCells = [
  ['#ff0000ff', null],
  ['#00ff0080', '#0000ffff'],
];

function readChunks(png: Uint8Array): Array<{ type: string; body: Uint8Array }> {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Array<{ type: string; body: Uint8Array }> = [];
  let at = 8;
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    chunks.push({ type, body: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return chunks;
}

describe('encodePng', () => {
  it('пишет корректную сигнатуру и заголовок', () => {
    const png = encodePng(renderCells(cells));
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const chunks = readChunks(png);
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const ihdr = new DataView(chunks[0].body.buffer, chunks[0].body.byteOffset);
    expect(ihdr.getUint32(0)).toBe(2);
    expect(ihdr.getUint32(4)).toBe(2);
    expect(chunks[0].body[8]).toBe(8);
    expect(chunks[0].body[9]).toBe(6);
  });

  it('пиксели восстанавливаются из IDAT (stored-режим)', () => {
    const png = encodePng(renderCells(cells));
    const [, idat] = readChunks(png);
    const raw = inflateSync(Buffer.from(idat.body));
    // по байту фильтра на строку + 4 байта на пиксель
    expect(raw.length).toBe(2 * (1 + 2 * 4));
    expect([...raw.subarray(1, 5)]).toEqual([255, 0, 0, 255]);
    expect([...raw.subarray(5, 9)]).toEqual([0, 0, 0, 0]);
    expect([...raw.subarray(10, 14)]).toEqual([0, 255, 0, 128]);
  });

  it('работает с внешним сжатием и даёт файл меньше', () => {
    const image = renderCells(cells, { scale: 16 });
    const stored = encodePng(image, storedDeflate);
    const deflated = encodePng(image, (data) => deflateSync(Buffer.from(data)));
    expect(deflated.length).toBeLessThan(stored.length);
    const [, idat] = readChunks(deflated);
    expect(inflateSync(Buffer.from(idat.body)).length).toBe(32 * (1 + 32 * 4));
  });

  it('масштабирует пиксели квадратами', () => {
    const image = renderCells([['#ff0000ff']], { scale: 3 });
    expect(image.width).toBe(3);
    expect(image.height).toBe(3);
    expect(image.data.every((value, index) => value === [255, 0, 0, 255][index % 4])).toBe(true);
  });

  it('умеет подкладывать непрозрачный фон', () => {
    const image = renderCells([[null]], { background: '#123456ff' });
    expect([...image.data]).toEqual([0x12, 0x34, 0x56, 255]);
  });
});
