import { beforeEach, describe, expect, it } from 'vitest';
import { countPainted, countPaintedRefs, createTexture, resolveRef, setPixel } from '~/core';
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

  it('незавершённый мазок не отключает историю у нового документа', () => {
    // Мазок начат, но кнопку отпустили мимо холста — endStroke не пришёл.
    store().beginStroke();
    store().paint([{ x: 0, y: 0 }]);

    store().newDocument('animation', 4, 4, 'бег');
    store().addSlide();

    expect(store().past).toHaveLength(1);
  });

  it('загрузка файла тоже закрывает подвисший мазок', () => {
    store().beginStroke();
    store().paint([{ x: 0, y: 0 }]);

    store().loadTexture(createTexture(4, 4, 'лист'));
    store().paint([{ x: 1, y: 1 }]);

    expect(store().past).toHaveLength(1);
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

describe('подмена текстуры', () => {
  beforeEach(() => {
    store().newDocument('animation', 3, 3, 'бег');
    useEditorStore.setState({ texture: setPixel(store().texture, 0, 0, '#00ff00ff') });
    store().setRef({ x: 0, y: 0 });
    store().paint([{ x: 2, y: 2 }]);
  });

  const textureWith = (size: number, points: Array<[number, number, string]>) =>
    points.reduce(
      (texture, [x, y, color]) => setPixel(texture, x, y, color),
      createTexture(size, size, 'другая'),
    );

  it('текстура того же размера перекрашивает кадры, не трогая ссылки', () => {
    store().replaceTexture(textureWith(3, [[0, 0, '#0000ffff']]));

    expect(store().texture.cells[0][0]).toBe('#0000ffff');
    expect(store().slides[0][2][2]).toEqual({ x: 0, y: 0 });
    expect(resolveRef(store().texture, store().slides[0][2][2])).toBe('#0000ffff');
  });

  it('не меняет имя документа', () => {
    store().replaceTexture(textureWith(3, [[0, 0, '#0000ffff']]));
    expect(store().documentName).toBe('бег');
  });

  it('по умолчанию подстраивает холст под размер текстуры', () => {
    store().replaceTexture(textureWith(5, [[0, 0, '#0000ffff']]));

    expect(store().texture.cells).toHaveLength(5);
    expect(store().slides[0]).toHaveLength(5);
    expect(store().slides[0][0]).toHaveLength(5);
    expect(store().slides[0][2][2]).toEqual({ x: 0, y: 0 });
  });

  it('с fit вписывает текстуру в текущий холст', () => {
    store().replaceTexture(
      textureWith(5, [
        [0, 0, '#0000ffff'],
        [4, 4, '#ff00ffff'],
      ]),
      { fit: true },
    );

    expect(store().texture.cells).toHaveLength(3);
    expect(store().slides[0]).toHaveLength(3);
    expect(store().texture.cells[0][0]).toBe('#0000ffff');
    expect(countPainted(store().texture)).toBe(1);
    expect(store().slides[0][2][2]).toEqual({ x: 0, y: 0 });
  });

  it('обнуляет ссылки на пиксели, которых в новой текстуре нет', () => {
    store().replaceTexture(textureWith(3, [[1, 1, '#0000ffff']]));

    expect(store().slides[0][2][2]).toBeNull();
    expect(countPaintedRefs(store().slides[0])).toBe(0);
  });

  it('сбрасывает выбранную ссылку', () => {
    store().replaceTexture(textureWith(3, [[0, 0, '#0000ffff']]));
    expect(store().currentRef).toBeNull();
  });

  it('откатывается по Ctrl+Z вместе с кадрами', () => {
    store().replaceTexture(textureWith(5, [[0, 0, '#0000ffff']]));
    store().undo();

    expect(store().texture.cells).toHaveLength(3);
    expect(store().texture.cells[0][0]).toBe('#00ff00ff');
    expect(store().slides[0][2][2]).toEqual({ x: 0, y: 0 });
    expect(store().dirty).toBe(true);
  });

  it('в режиме текстуры просто меняет холст', () => {
    store().newDocument('texture', 3, 3, 'лист');
    store().replaceTexture(textureWith(5, [[4, 4, '#0000ffff']]));

    expect(store().texture.cells).toHaveLength(5);
    expect(store().texture.cells[4][4]).toBe('#0000ffff');
    expect(store().slides).toHaveLength(0);
  });
});

describe('привязка к файлу на диске', () => {
  it('у нового документа цели сохранения нет', () => {
    expect(store().saveTarget).toBeNull();
  });

  it('запоминает имя файла, в который пишем', () => {
    store().setSaveTarget('лиса.pxlmt');
    expect(store().saveTarget).toBe('лиса.pxlmt');
  });

  it('создание документа рвёт привязку к прежнему файлу', () => {
    store().setSaveTarget('лиса.pxlmt');
    store().newDocument('texture', 4, 4, 'новый');
    expect(store().saveTarget).toBeNull();
  });

  it('загрузка текстуры рвёт привязку', () => {
    store().setSaveTarget('лиса.pxlmt');
    store().loadTexture(createTexture(4, 4, 'другая'));
    expect(store().saveTarget).toBeNull();
  });

  it('загрузка анимации рвёт привязку', () => {
    store().setSaveTarget('бег.pxlma');
    store().loadAnimation({ name: 'другой', texture: createTexture(4, 4), slides: [] });
    expect(store().saveTarget).toBeNull();
  });

  it('закрытие документа рвёт привязку', () => {
    store().setSaveTarget('лиса.pxlmt');
    store().closeDocument();
    expect(store().saveTarget).toBeNull();
  });

  it('рисование привязку не трогает', () => {
    store().setSaveTarget('лиса.pxlmt');
    store().paint([{ x: 0, y: 0 }]);
    expect(store().saveTarget).toBe('лиса.pxlmt');
  });

  it('не переживает перезагрузку через localStorage', () => {
    store().setSaveTarget('лиса.pxlmt');
    const saved = localStorage.getItem('pixelmation.editor') ?? '';
    expect(saved).not.toContain('saveTarget');
  });
});
