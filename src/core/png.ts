/**
 * Минимальный PNG-энкодер без зависимостей.
 *
 * Сжатие подаётся снаружи: в Node это `zlib.deflateSync`, в браузере хватает
 * `storedDeflate` (zlib-поток без сжатия) — либо вообще `canvas.toDataURL`.
 */
import type { RgbaImage } from './types';

/** Функция сжатия: на вход сырые байты, на выходе zlib-поток. */
export type Deflate = (data: Uint8Array) => Uint8Array;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** zlib-поток без сжатия (stored-блоки). Работает где угодно, но файл крупнее. */
export const storedDeflate: Deflate = (data) => {
  const maxBlock = 65535;
  const blocks = Math.max(1, Math.ceil(data.length / maxBlock));
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4);
  let at = 0;
  out[at++] = 0x78;
  out[at++] = 0x01;
  for (let i = 0; i < blocks; i++) {
    const start = i * maxBlock;
    const end = Math.min(start + maxBlock, data.length);
    const len = end - start;
    out[at++] = i === blocks - 1 ? 1 : 0;
    out[at++] = len & 0xff;
    out[at++] = (len >> 8) & 0xff;
    out[at++] = ~len & 0xff;
    out[at++] = (~len >> 8) & 0xff;
    out.set(data.subarray(start, end), at);
    at += len;
  }
  const sum = adler32(data);
  out[at++] = (sum >>> 24) & 0xff;
  out[at++] = (sum >>> 16) & 0xff;
  out[at++] = (sum >>> 8) & 0xff;
  out[at++] = sum & 0xff;
  return out.subarray(0, at);
};

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** Кодирует RGBA-буфер в PNG. */
export function encodePng(image: RgbaImage, deflate: Deflate = storedDeflate): Uint8Array {
  const { width, height, data } = image;
  if (width <= 0 || height <= 0) throw new RangeError('PNG: размер должен быть положительным');
  if (data.length !== width * height * 4) {
    throw new RangeError('PNG: длина буфера не совпадает с размером изображения');
  }

  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // фильтр None
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const ihdr = new Uint8Array(13);
  const header = new DataView(ihdr.buffer);
  header.setUint32(0, width);
  header.setUint32(4, height);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 6; // truecolor + alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const parts = [
    Uint8Array.from(PNG_SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
}
