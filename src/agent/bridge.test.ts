import { beforeEach, describe, expect, it } from 'vitest';
import { parseAnimation, parseTexture } from '~/core';
import { useEditorStore } from '~/state/store';
import { createAgentApi, type PixelmationApi } from './bridge';

let api: PixelmationApi;

beforeEach(() => {
  localStorage.clear();
  api = createAgentApi();
  api.close();
});

describe('API агента: текстура', () => {
  beforeEach(() => {
    api.newTexture(8, 8, 'герой');
  });

  it('создаёт документ и отдаёт сводку', () => {
    const state = api.state();
    expect(state).toMatchObject({ mode: 'texture', name: 'герой', width: 8, height: 8, painted: 0 });
  });

  it('рисует пиксели, линии и фигуры', () => {
    api.setPixel(0, 0, '#ff0000ff');
    expect(api.state().painted).toBe(1);

    api.line(0, 1, 7, 1, '#00ff00ff');
    expect(api.state().painted).toBe(9);

    api.rect(2, 3, 5, 6, '#0000ffff', true);
    expect(api.state().painted).toBe(9 + 16);

    api.fill(7, 7, '#ffffffff');
    expect(api.state().painted).toBeGreaterThan(25);
  });

  it('текстовое превью показывает рисунок', () => {
    api.setPixel(1, 0, '#ff0000ff');
    const preview = api.preview();
    expect(preview.split('\n')[0]).toBe('.0......');
    expect(api.legend()[0]).toMatchObject({ symbol: '0', color: '#ff0000ff' });
    expect(api.preview({ rulers: true })).toContain('01234567');
  });

  it('рисует целую картинку из текстовой карты', () => {
    api.drawAscii(['.##.', '#..#', '.##.'], { '#': '#3ddcedff' }, { x: 2, y: 2 });
    expect(api.state().painted).toBe(6);
    expect(api.preview().split('\n')[2]).toBe('...00...');
  });

  it('стирает, сдвигает и отменяет', () => {
    api.setPixel(0, 0, '#ff0000ff');
    api.shift(1, 1);
    expect(api.preview().split('\n')[1]).toBe('.0......');
    api.undo();
    expect(api.preview().split('\n')[0]).toBe('0.......');
    api.redo();
    expect(api.preview().split('\n')[1]).toBe('.0......');
    api.erase([[1, 1]]);
    expect(api.state().painted).toBe(0);
  });

  it('отдаёт валидный .pxlmt', () => {
    api.setPixel(0, 0, '#ff0000ff');
    const texture = parseTexture(api.toJSON());
    expect(texture.name).toBe('герой');
    expect(texture.cells[0][0]).toBe('#ff0000ff');
  });

  it('не даёт рисовать без документа', () => {
    api.close();
    expect(() => api.setPixel(0, 0, '#fff')).toThrow(/Документ не открыт/);
  });
});

describe('API агента: анимация', () => {
  beforeEach(() => {
    api.newAnimation(6, 6, 'бег');
  });

  it('рисует цветом, сам заводя пиксель в текстуре', () => {
    api.setPixel(1, 1, '#ffcc00ff');
    const state = api.state();
    expect(state.surface).toBe('slide');
    expect(state.painted).toBe(1);
    expect(state.colors).toBe(1);
    expect(api.preview()).toContain('0');
  });

  it('принимает и прямую ссылку на пиксель текстуры', () => {
    api.editTexture(true);
    api.setPixel(0, 0, '#00ff00ff');
    api.editTexture(false);
    api.setPixel(3, 3, { x: 0, y: 0 });
    expect(api.state().painted).toBe(1);
  });

  it('управляет кадрами', () => {
    api.setPixel(0, 0, '#ffcc00ff');
    api.duplicateSlide();
    api.addSlide();
    expect(api.state().slides).toBe(3);
    expect(api.slides().map((slide) => slide.painted)).toEqual([1, 1, 0]);

    api.moveSlide(2, 0);
    expect(api.slides().map((slide) => slide.painted)).toEqual([0, 1, 1]);

    api.gotoSlide(0);
    api.deleteSlide();
    expect(api.state().slides).toBe(2);
  });

  it('отдаёт валидный .pxlma вместе с текстурой', () => {
    api.setPixel(2, 2, '#ffcc00ff');
    const animation = parseAnimation(api.toJSON());
    expect(animation.name).toBe('бег');
    expect(animation.slides[0][2][2]).not.toBeNull();
    expect(animation.texture.cells.flat().filter(Boolean)).toEqual(['#ffcc00ff']);
  });

  it('правка текстуры чистит повисшие ссылки', () => {
    api.setPixel(2, 2, '#ffcc00ff');
    api.editTexture(true);
    api.clear();
    api.editTexture(false);
    expect(api.state().painted).toBe(0);
  });
});

describe('API агента: загрузка файлов', () => {
  it('открывает содержимое .pxlmt', () => {
    const json = JSON.stringify({ name: 'из файла', cells: [['#ff0000ff', null]] });
    const state = api.openFile('sample.pxlmt', json);
    expect(state).toMatchObject({ mode: 'texture', width: 2, height: 1, painted: 1 });
  });

  it('открывает legacy-файл первой версии', () => {
    const json = JSON.stringify({ name: 'старый', cells: '2=2.#00ff00ff' });
    const state = api.openFile('old.pxlmt', json);
    expect(state).toMatchObject({ width: 2, height: 2, painted: 4 });
  });

  it('сообщает о непонятном файле', () => {
    expect(() => api.openFile('broken.pxlmt', '{')).toThrow(/JSON/);
  });
});

describe('API агента: справка', () => {
  it('перечисляет команды', () => {
    expect(api.help().length).toBeGreaterThan(5);
    expect(api.help().join('\n')).toContain('drawAscii');
  });

  it('живёт в состоянии store', () => {
    api.newTexture(4, 4, 'x');
    expect(useEditorStore.getState().mode).toBe('texture');
  });
});
