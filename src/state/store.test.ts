import { beforeEach, describe, expect, it } from 'vitest';
import { countPainted, countPaintedRefs, setPixel } from '~/core';
import { useEditorStore } from './store';

const store = () => useEditorStore.getState();

beforeEach(() => {
  localStorage.clear();
  store().newDocument('texture', 4, 4, 'тест');
  store().setColor('#ff0000ff');
});

describe('документ', () => {
  it('создаётся пустым и чистым', () => {
    expect(store().mode).toBe('texture');
    expect(store().texture.cells).toHaveLength(4);
    expect(store().dirty).toBe(false);
    expect(store().past).toHaveLength(0);
  });

  it('рисование помечает документ несохранённым', () => {
    store().paint([{ x: 0, y: 0 }]);
    expect(store().texture.cells[0][0]).toBe('#ff0000ff');
    expect(store().dirty).toBe(true);
    store().markSaved();
    expect(store().dirty).toBe(false);
  });

  it('пипетка забирает цвет с холста', () => {
    store().paint([{ x: 1, y: 1 }]);
    store().setColor('#00ff00ff');
    store().pick({ x: 1, y: 1 });
    expect(store().color).toBe('#ff0000ff');
    store().pick({ x: 3, y: 3 });
    expect(store().color).toBeNull();
  });

  it('прозрачный цвет не затирает последний цветной', () => {
    store().setTransparentColor();
    expect(store().color).toBeNull();
    expect(store().lastColor).toBe('#ff0000ff');
  });

  it('заливка закрашивает связную область', () => {
    store().fillAt({ x: 0, y: 0 });
    expect(countPainted(store().texture)).toBe(16);
  });

  it('сдвиг двигает рисунок', () => {
    store().paint([{ x: 0, y: 0 }]);
    store().shiftBy(1, 0);
    expect(store().texture.cells[0][0]).toBeNull();
    expect(store().texture.cells[0][1]).toBe('#ff0000ff');
  });

  it('смена размера сохраняет содержимое', () => {
    store().paint([{ x: 0, y: 0 }]);
    store().resizeDocument(8, 8);
    expect(store().texture.cells).toHaveLength(8);
    expect(store().texture.cells[0][0]).toBe('#ff0000ff');
  });
});

describe('история', () => {
  it('отменяет и повторяет действие', () => {
    store().paint([{ x: 0, y: 0 }]);
    store().undo();
    expect(store().texture.cells[0][0]).toBeNull();
    store().redo();
    expect(store().texture.cells[0][0]).toBe('#ff0000ff');
  });

  it('мазок с зажатой кнопкой — одна запись в истории', () => {
    store().beginStroke();
    store().paint([{ x: 0, y: 0 }]);
    store().paint([{ x: 1, y: 0 }]);
    store().paint([{ x: 2, y: 0 }]);
    store().endStroke();
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(countPainted(store().texture)).toBe(0);
  });

  it('пустой мазок не засоряет историю', () => {
    store().beginStroke();
    store().endStroke();
    expect(store().past).toHaveLength(0);
  });

  it('новое действие обнуляет цепочку повтора', () => {
    store().paint([{ x: 0, y: 0 }]);
    store().undo();
    expect(store().future).toHaveLength(1);
    store().paint([{ x: 1, y: 1 }]);
    expect(store().future).toHaveLength(0);
  });

  it('отмена без истории ничего не ломает', () => {
    store().undo();
    store().redo();
    expect(countPainted(store().texture)).toBe(0);
  });
});

describe('анимация', () => {
  beforeEach(() => {
    store().newDocument('animation', 3, 3, 'бег');
    useEditorStore.setState({ texture: setPixel(store().texture, 0, 0, '#00ff00ff') });
    store().setRef({ x: 0, y: 0 });
  });

  it('рисует ссылками на текстуру', () => {
    store().paint([{ x: 2, y: 2 }]);
    expect(store().slides[0][2][2]).toEqual({ x: 0, y: 0 });
  });

  it('перелистывает слайды по кругу', () => {
    store().addSlide();
    expect(store().slides).toHaveLength(2);
    expect(store().currentSlide).toBe(1);
    store().nextSlide();
    expect(store().currentSlide).toBe(0);
    store().prevSlide();
    expect(store().currentSlide).toBe(1);
  });

  it('копирует, вставляет и удаляет слайды', () => {
    store().paint([{ x: 0, y: 0 }]);
    store().duplicateSlide();
    expect(store().slides).toHaveLength(2);
    expect(countPaintedRefs(store().slides[1])).toBe(1);

    store().copySlide();
    store().pasteSlide(0);
    expect(store().slides).toHaveLength(3);
    expect(store().currentSlide).toBe(0);

    store().deleteSlide();
    expect(store().slides).toHaveLength(2);
  });

  it('последний слайд не удаляется, а очищается', () => {
    store().paint([{ x: 0, y: 0 }]);
    store().deleteSlide();
    expect(store().slides).toHaveLength(1);
    expect(countPaintedRefs(store().slides[0])).toBe(0);
  });

  it('вставляет текстуру как слайд', () => {
    store().insertTextureSlide();
    expect(store().slides).toHaveLength(2);
    expect(countPaintedRefs(store().slides[1])).toBe(1);
  });

  it('правка текстуры внутри анимации чистит повисшие ссылки', () => {
    store().paint([{ x: 1, y: 1 }]);
    expect(store().slides[0][1][1]).toEqual({ x: 0, y: 0 });

    store().setAnimationTab('texture');
    store().erase([{ x: 0, y: 0 }]); // стёрли пиксель, на который ссылались
    store().setAnimationTab('slides');

    expect(store().texture.cells[0][0]).toBeNull();
    expect(store().slides[0][1][1]).toBeNull();
  });

  it('пипетка в анимации копирует ссылку', () => {
    store().paint([{ x: 1, y: 1 }]);
    store().setRef(null);
    store().pick({ x: 1, y: 1 });
    expect(store().currentRef).toEqual({ x: 0, y: 0 });
  });
});
