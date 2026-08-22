import { describe, expect, it } from 'vitest';
import { createTexture, parseProjectFile, setPixel } from '~/core';
import { animationFile, textureFile } from './files';

describe('содержимое файлов проекта', () => {
  it('текстура превращается в имя и разбираемый json', () => {
    const texture = setPixel(createTexture(2, 2, 'лиса'), 0, 0, '#ff0000ff');
    const { fileName, json } = textureFile(texture);

    expect(fileName).toBe('лиса.pxlmt');
    const parsed = parseProjectFile(fileName, json);
    expect(parsed.kind).toBe('texture');
    if (parsed.kind === 'texture') expect(parsed.texture.cells[0][0]).toBe('#ff0000ff');
  });

  it('анимация превращается в имя и разбираемый json', () => {
    const texture = setPixel(createTexture(2, 2, 'палитра'), 0, 0, '#00ff00ff');
    const { fileName, json } = animationFile({
      name: 'бег',
      texture,
      slides: [[[{ x: 0, y: 0 }, null], [null, null]]],
    });

    expect(fileName).toBe('бег.pxlma');
    const parsed = parseProjectFile(fileName, json);
    expect(parsed.kind).toBe('animation');
    if (parsed.kind === 'animation') expect(parsed.animation.slides[0][0][0]).toEqual({ x: 0, y: 0 });
  });

  it('документ без имени получает расширение при запасном имени', () => {
    expect(textureFile(createTexture(2, 2)).fileName).toMatch(/\.pxlmt$/);
    expect(animationFile({ name: '', texture: createTexture(2, 2), slides: [] }).fileName).toMatch(
      /\.pxlma$/,
    );
  });
});
