import { describe, expect, it } from 'vitest';
import {
  parseAnimation,
  parseProjectFile,
  parseTexture,
  serializeAnimation,
  serializeTexture,
  toFileName,
} from './codec';
import { createAnimation, setRef } from './animation';
import { createTexture, setPixel } from './texture';
import { PixelmationFormatError } from './types';

function sampleTexture() {
  let texture = createTexture(2, 2, 'герой');
  texture = setPixel(texture, 0, 0, '#ff0000ff');
  texture = setPixel(texture, 1, 0, '#ff0000ff');
  texture = setPixel(texture, 1, 1, '#00ff0080');
  return texture;
}

describe('.pxlmt', () => {
  it('пишет и читает современный формат без потерь', () => {
    const texture = sampleTexture();
    const json = serializeTexture(texture);
    expect(JSON.parse(json)).toEqual({
      name: 'герой',
      cells: [
        ['#ff0000ff', '#ff0000ff'],
        [null, '#00ff0080'],
      ],
    });
    expect(parseTexture(json)).toEqual(texture);
  });

  it('читает legacy-строку с RLE', () => {
    const legacy = JSON.stringify({
      name: 'старый',
      cells: '1=2.#ff0000ff;1=1.null,1.#00ff00ff',
    });
    const texture = parseTexture(legacy);
    expect(texture.name).toBe('старый');
    expect(texture.cells).toEqual([
      ['#ff0000ff', '#ff0000ff'],
      [null, '#00ff00ff'],
    ]);
  });

  it('приводит устаревшие обозначения пустоты к null', () => {
    const texture = parseTexture({ name: '', cells: [['transparent', 'null', '#00000000']] });
    expect(texture.cells).toEqual([[null, null, null]]);
  });

  it('умеет писать обратно в legacy-формат', () => {
    const legacy = JSON.parse(serializeTexture(sampleTexture(), { legacy: true }));
    expect(typeof legacy.cells).toBe('string');
    expect(parseTexture(JSON.stringify(legacy))).toEqual(sampleTexture());
  });

  it('сообщает понятную ошибку на кривом файле', () => {
    expect(() => parseTexture('{')).toThrow(PixelmationFormatError);
    expect(() => parseTexture({ name: 'x' })).toThrow(/отсутствует поле cells/);
    expect(() => parseTexture({ name: 'x', cells: [['#fff'], []] })).toThrow(/разную длину/);
  });
});

describe('.pxlma', () => {
  it('пишет и читает современный формат', () => {
    const animation = setRef(createAnimation(sampleTexture(), 'бег'), 0, 1, 1, { x: 0, y: 0 });
    const parsed = parseAnimation(serializeAnimation(animation));
    expect(parsed.name).toBe('бег');
    expect(parsed.slides[0][1][1]).toEqual({ x: 0, y: 0 });
    expect(parsed.texture).toEqual(sampleTexture());
  });

  it('читает legacy-анимацию и переставляет оси ссылок', () => {
    // legacy: ссылка "1-0" означала строку 1, столбец 0 → современное {x: 0, y: 1}
    const legacy = JSON.stringify({
      name: 'старая',
      slides: '1!1=1.1-0,1.null;1=2.null',
      texture: { name: 'т', cells: '2=2.#ff0000ff' },
    });
    const animation = parseAnimation(legacy);
    expect(animation.slides).toHaveLength(1);
    expect(animation.slides[0][0][0]).toEqual({ x: 0, y: 1 });
    expect(animation.slides[0][0][1]).toBeNull();
  });

  it('legacy-запись читается обратно', () => {
    const animation = setRef(createAnimation(sampleTexture(), 'бег'), 0, 1, 1, { x: 1, y: 0 });
    const legacy = JSON.parse(serializeAnimation(animation, { legacy: true }));
    expect(typeof legacy.slides).toBe('string');
    expect(typeof legacy.texture.cells).toBe('string');
    const parsed = parseAnimation(JSON.stringify(legacy));
    expect(parsed.slides[0][1][1]).toEqual({ x: 1, y: 0 });
  });

  it('выкидывает ссылки на прозрачные пиксели при сохранении', () => {
    const animation = setRef(createAnimation(sampleTexture(), 'бег'), 0, 0, 0, { x: 0, y: 1 });
    const parsed = parseAnimation(serializeAnimation(animation));
    expect(parsed.slides[0][0][0]).toBeNull();
  });
});

describe('определение типа файла', () => {
  it('узнаёт формат по расширению', () => {
    const texture = parseProjectFile('hero.pxlmt', serializeTexture(sampleTexture()));
    expect(texture.kind).toBe('texture');
    const animation = parseProjectFile(
      'run.pxlma',
      serializeAnimation(createAnimation(sampleTexture())),
    );
    expect(animation.kind).toBe('animation');
  });

  it('при незнакомом расширении смотрит в содержимое', () => {
    const result = parseProjectFile('dump.json', serializeTexture(sampleTexture()));
    expect(result.kind).toBe('texture');
  });

  it('чистит имя файла', () => {
    expect(toFileName('мой герой', '.pxlmt')).toBe('мой герой.pxlmt');
    expect(toFileName('a/b:c', '.pxlmt')).toBe('a_b_c.pxlmt');
    expect(toFileName('  ', '.pxlma')).toBe('untitled.pxlma');
  });
});
