import { describe, expect, it } from 'vitest';
import { encodeGif, lzwEncode } from './gif';
import { renderCells } from './render';
import type { RgbaImage, TextureCells } from './types';

/** Минимальный LZW-декодер GIF — нужен, чтобы проверить энкодер по-настоящему. */
function lzwDecode(bytes: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let dict: number[][] = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < clearCode; i++) dict.push([i]);
    dict.push([], []); // clear + eoi
    codeSize = minCodeSize + 1;
  };
  reset();

  const out: number[] = [];
  let previous: number[] | null = null;
  let bitPos = 0;

  const readCode = (): number | null => {
    let code = 0;
    for (let i = 0; i < codeSize; i++) {
      const byte = bytes[bitPos >> 3];
      if (byte === undefined) return null;
      code |= ((byte >> (bitPos & 7)) & 1) << i;
      bitPos++;
    }
    return code;
  };

  for (;;) {
    const code = readCode();
    if (code === null || code === eoiCode) break;
    if (code === clearCode) {
      reset();
      previous = null;
      continue;
    }
    let entry: number[];
    if (code < dict.length && dict[code].length > 0) {
      entry = dict[code];
    } else if (previous) {
      entry = [...previous, previous[0]];
    } else {
      throw new Error('Некорректный поток LZW');
    }
    out.push(...entry);
    if (previous) {
      dict.push([...previous, entry[0]]);
      if (dict.length === 1 << codeSize && codeSize < 12) codeSize++;
    }
    previous = entry;
  }
  return out;
}

interface ParsedGif {
  width: number;
  height: number;
  palette: Array<[number, number, number]>;
  transparentIndex: number;
  frames: number[][];
  delaysCs: number[];
  loops: number | null;
}

/** Разбор собранного GIF — ровно настолько, насколько нужно тестам. */
function parseGif(bytes: Uint8Array): ParsedGif {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(String.fromCharCode(...bytes.subarray(0, 6))).toBe('GIF89a');
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const packed = bytes[10];
  const paletteSize = 1 << ((packed & 0x07) + 1);
  let at = 13;
  const palette: Array<[number, number, number]> = [];
  for (let i = 0; i < paletteSize; i++) {
    palette.push([bytes[at], bytes[at + 1], bytes[at + 2]]);
    at += 3;
  }

  const frames: number[][] = [];
  const delaysCs: number[] = [];
  let transparentIndex = -1;
  let loops: number | null = null;

  while (at < bytes.length) {
    const marker = bytes[at++];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const label = bytes[at++];
      if (label === 0xf9) {
        const size = bytes[at++];
        const flags = bytes[at];
        delaysCs.push(view.getUint16(at + 1, true));
        if (flags & 1) transparentIndex = bytes[at + 3];
        at += size;
        at++; // терминатор блока
      } else if (label === 0xff) {
        const size = bytes[at++];
        at += size;
        const dataSize = bytes[at++];
        if (dataSize >= 3) loops = view.getUint16(at + 1, true);
        at += dataSize;
        while (bytes[at] !== 0) at += bytes[at] + 1;
        at++;
      } else {
        while (bytes[at] !== 0) at += bytes[at] + 1;
        at++;
      }
      continue;
    }
    if (marker === 0x2c) {
      at += 8; // позиция и размер кадра
      const localFlags = bytes[at++];
      expect(localFlags & 0x80).toBe(0); // локальной палитры нет
      const minCodeSize = bytes[at++];
      const chunks: number[] = [];
      while (bytes[at] !== 0) {
        const size = bytes[at++];
        for (let i = 0; i < size; i++) chunks.push(bytes[at + i]);
        at += size;
      }
      at++;
      frames.push(lzwDecode(Uint8Array.from(chunks), minCodeSize));
      continue;
    }
    throw new Error(`Неизвестный маркер GIF: ${marker}`);
  }

  return { width, height, palette, transparentIndex, frames, delaysCs, loops };
}

function cellsToImage(cells: TextureCells): RgbaImage {
  return renderCells(cells);
}

describe('lzwEncode', () => {
  it('поток разжимается обратно в исходные индексы', () => {
    const indices = Uint8Array.from([0, 0, 1, 1, 2, 2, 2, 3, 0, 1, 2, 3, 3, 3, 3, 0]);
    const encoded = Uint8Array.from(lzwEncode(indices, 2));
    expect(lzwDecode(encoded, 2)).toEqual([...indices]);
  });

  it('переживает длинный поток с переполнением словаря', () => {
    const indices = new Uint8Array(5000);
    for (let i = 0; i < indices.length; i++) indices[i] = (i * 7 + (i >> 3)) % 16;
    const encoded = Uint8Array.from(lzwEncode(indices, 4));
    expect(lzwDecode(encoded, 4)).toEqual([...indices]);
  });
});

describe('encodeGif', () => {
  const red = '#ff0000ff';
  const green = '#00ff00ff';

  it('собирает анимацию из двух кадров и она читается обратно', () => {
    const frameA: TextureCells = [
      [red, null],
      [null, green],
    ];
    const frameB: TextureCells = [
      [null, green],
      [red, null],
    ];
    const gif = encodeGif([cellsToImage(frameA), cellsToImage(frameB)], { delayMs: 120 });
    const parsed = parseGif(gif);

    expect(parsed.width).toBe(2);
    expect(parsed.height).toBe(2);
    expect(parsed.frames).toHaveLength(2);
    expect(parsed.delaysCs).toEqual([12, 12]);
    expect(parsed.loops).toBe(0);
    expect(parsed.transparentIndex).toBeGreaterThanOrEqual(0);

    const toHex = (index: number): string | null => {
      if (index === parsed.transparentIndex) return null;
      const [r, g, b] = parsed.palette[index];
      return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}ff`;
    };
    expect(parsed.frames[0].map(toHex)).toEqual([red, null, null, green]);
    expect(parsed.frames[1].map(toHex)).toEqual([null, green, red, null]);
  });

  it('учитывает масштаб и разные задержки кадров', () => {
    const cells: TextureCells = [[red]];
    const gif = encodeGif([renderCells(cells, { scale: 4 }), renderCells(cells, { scale: 4 })], {
      delayMs: [50, 250],
    });
    const parsed = parseGif(gif);
    expect(parsed.width).toBe(4);
    expect(parsed.height).toBe(4);
    expect(parsed.delaysCs).toEqual([5, 25]);
    expect(parsed.frames[0]).toHaveLength(16);
  });

  it('переживает холст с сотнями цветов', () => {
    const cells: TextureCells = [];
    for (let y = 0; y < 20; y++) {
      const row = [];
      for (let x = 0; x < 20; x++) {
        row.push(`#${((y * 20 + x) * 613 % 0xffffff).toString(16).padStart(6, '0')}ff`);
      }
      cells.push(row);
    }
    const gif = encodeGif([cellsToImage(cells)]);
    const parsed = parseGif(gif);
    expect(parsed.frames[0]).toHaveLength(400);
  });

  it('байт в байт совпадает с эталоном, проверенным декодером браузера', () => {
    // Эталон снят с рабочего файла и проверён Chrome ImageDecoder: он ловит
    // рассинхрон ширины кода LZW, который собственный декодер не замечает.
    const cells: TextureCells = [
      [red, red, red, red],
      [green, green, green, green],
      [null, null, null, null],
      [null, null, null, null],
    ];
    const gif = encodeGif([cellsToImage(cells)], { delayMs: 100 });
    const base64 = Buffer.from(gif).toString('base64');
    expect(base64).toBe('R0lGODlhBAAEAIEAAP8AAAD/AAAAAAAAACH5BAkKAAIALAAAAAAEAAQAAAIGhBEZws0FADs=');
  });

  it('ругается на кадры разного размера', () => {
    expect(() =>
      encodeGif([cellsToImage([[red]]), cellsToImage([[red, red]])]),
    ).toThrow(/одного размера/);
  });
});
