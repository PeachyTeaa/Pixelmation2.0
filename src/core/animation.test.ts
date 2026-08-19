import { describe, expect, it } from 'vitest';
import {
  addSlide,
  countPaintedRefs,
  createAnimation,
  deleteSlide,
  duplicateSlide,
  fillRefArea,
  insertTextureAsSlide,
  moveSlide,
  resizeAnimation,
  resolveSlide,
  sanitizeAnimation,
  setRef,
  shiftSlide,
  withTexture,
} from './animation';
import { createTexture, setPixel } from './texture';
import type { Texture } from './types';

function paintedTexture(): Texture {
  let texture = createTexture(3, 3, 'палитра');
  texture = setPixel(texture, 0, 0, '#ff0000ff');
  texture = setPixel(texture, 1, 0, '#00ff00ff');
  return texture;
}

describe('animation', () => {
  it('создаётся с одним пустым слайдом размером с текстуру', () => {
    const animation = createAnimation(paintedTexture(), 'бег');
    expect(animation.slides).toHaveLength(1);
    expect(animation.slides[0]).toHaveLength(3);
    expect(animation.slides[0][0]).toHaveLength(3);
    expect(countPaintedRefs(animation.slides[0])).toBe(0);
  });

  it('ставит ссылку и разрешает её в цвет текстуры', () => {
    const animation = setRef(createAnimation(paintedTexture()), 0, 2, 2, { x: 1, y: 0 });
    expect(animation.slides[0][2][2]).toEqual({ x: 1, y: 0 });
    expect(resolveSlide(animation.slides[0], animation.texture)[2][2]).toBe('#00ff00ff');
  });

  it('заливает область ссылками', () => {
    const animation = fillRefArea(createAnimation(paintedTexture()), 0, 0, 0, { x: 0, y: 0 });
    expect(countPaintedRefs(animation.slides[0])).toBe(9);
  });

  it('сдвигает содержимое слайда', () => {
    let animation = setRef(createAnimation(paintedTexture()), 0, 0, 0, { x: 0, y: 0 });
    animation = shiftSlide(animation, 0, 1, 1);
    expect(animation.slides[0][0][0]).toBeNull();
    expect(animation.slides[0][1][1]).toEqual({ x: 0, y: 0 });
  });

  it('добавляет, копирует, удаляет и переставляет слайды', () => {
    let animation = setRef(createAnimation(paintedTexture()), 0, 0, 0, { x: 0, y: 0 });

    const added = addSlide(animation, 0);
    expect(added.animation.slides).toHaveLength(2);
    expect(added.index).toBe(1);
    expect(countPaintedRefs(added.animation.slides[1])).toBe(0);

    const copied = duplicateSlide(added.animation, 0);
    expect(copied.animation.slides).toHaveLength(3);
    expect(copied.index).toBe(1);
    expect(countPaintedRefs(copied.animation.slides[1])).toBe(1);

    const moved = moveSlide(copied.animation, 0, 2);
    expect(moved.index).toBe(2);
    expect(countPaintedRefs(moved.animation.slides[2])).toBe(1);

    const removed = deleteSlide(moved.animation, 2);
    expect(removed.animation.slides).toHaveLength(2);
    expect(removed.index).toBe(1);

    animation = removed.animation;
    const cleared = deleteSlide(deleteSlide(animation, 1).animation, 0);
    expect(cleared.animation.slides).toHaveLength(1);
    expect(countPaintedRefs(cleared.animation.slides[0])).toBe(0);
  });

  it('вставляет текстуру целиком как слайд', () => {
    const { animation, index } = insertTextureAsSlide(createAnimation(paintedTexture()), 0);
    expect(index).toBe(1);
    expect(countPaintedRefs(animation.slides[1])).toBe(2);
    expect(animation.slides[1][0][0]).toEqual({ x: 0, y: 0 });
  });

  it('чистит ссылки на прозрачные пиксели', () => {
    const animation = setRef(createAnimation(paintedTexture()), 0, 0, 0, { x: 2, y: 2 });
    expect(sanitizeAnimation(animation).slides[0][0][0]).toBeNull();
  });

  it('чистит ссылки за пределами новой текстуры', () => {
    const animation = setRef(createAnimation(paintedTexture()), 0, 0, 0, { x: 1, y: 0 });
    const replaced = withTexture(animation, createTexture(1, 1));
    expect(replaced.slides[0]).toHaveLength(1);
    expect(replaced.slides[0][0][0]).toBeNull();
  });

  it('меняет размер вместе с текстурой', () => {
    const animation = resizeAnimation(createAnimation(paintedTexture()), 5, 5);
    expect(animation.texture.cells).toHaveLength(5);
    expect(animation.slides[0][4]).toHaveLength(5);
  });
});
