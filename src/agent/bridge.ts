/**
 * Руки агента внутри приложения.
 *
 * После загрузки страницы в глобальной области появляется `window.pixelmation` —
 * полный набор команд редактора, который можно вызывать из консоли или из
 * инструмента автоматизации браузера. Все методы возвращают только
 * JSON-совместимые данные, чтобы результат было видно на другой стороне.
 */
import {
  asciiPreview,
  asciiPreviewWithRulers,
  countPainted,
  countPaintedRefs,
  ellipsePoints,
  linePoints,
  normalizeColor,
  parseAnimation,
  parseProjectFile,
  parseTexture,
  rectPoints,
  renderCells,
  resolveSlide,
  serializeAnimation,
  serializeTexture,
  texturePalette,
  textureSize,
  type Animation,
  type Cell,
  type Point,
  type SlideCell,
  type Texture,
  type TextureCells,
} from '~/core';
import { isTextureSurface, toAnimation, useEditorStore } from '~/state/store';
import type { Tool } from '~/state/types';
import { buildGif, imageToDataUrl } from '~/services/exportImage';
import { saveCurrentDocument } from '~/services/save';
import { toast } from '~/services/toast';

const store = () => useEditorStore.getState();

function requireDocument(): void {
  if (store().mode === null) {
    throw new Error('Документ не открыт: вызовите pixelmation.newTexture() или newAnimation()');
  }
}

function activeCells(): TextureCells {
  const state = store();
  if (isTextureSurface(state)) return state.texture.cells;
  const slide = state.slides[state.currentSlide];
  return slide ? resolveSlide(slide, state.texture) : state.texture.cells;
}

/** Краткая сводка состояния — её агент читает после каждого действия. */
function summary() {
  const state = store();
  const size = textureSize(state.texture);
  return {
    mode: state.mode,
    name: state.documentName,
    width: size.width,
    height: size.height,
    surface: isTextureSurface(state) ? ('texture' as const) : ('slide' as const),
    slides: state.slides.length,
    currentSlide: state.currentSlide,
    painted: isTextureSurface(state)
      ? countPainted(state.texture)
      : state.slides[state.currentSlide]
        ? countPaintedRefs(state.slides[state.currentSlide])
        : 0,
    colors: texturePalette(state.texture).length,
    color: state.color,
    currentRef: state.currentRef,
    tool: state.tool,
    dirty: state.dirty,
  };
}

function pointsFrom(input: unknown): Point[] {
  if (!Array.isArray(input)) throw new Error('Ожидался массив точек');
  return input.map((item) => {
    if (Array.isArray(item) && item.length >= 2) return { x: Number(item[0]), y: Number(item[1]) };
    const point = item as Partial<Point>;
    if (typeof point?.x === 'number' && typeof point?.y === 'number') return { x: point.x, y: point.y };
    throw new Error(`Не понял точку: ${JSON.stringify(item)}`);
  });
}

function toRef(input: unknown): SlideCell {
  if (input === null || input === undefined) return null;
  if (Array.isArray(input) && input.length >= 2) return { x: Number(input[0]), y: Number(input[1]) };
  const point = input as Partial<Point>;
  if (typeof point?.x === 'number' && typeof point?.y === 'number') return { x: point.x, y: point.y };
  throw new Error(`Не понял ссылку на пиксель: ${JSON.stringify(input)}`);
}

/**
 * Значение для кадра анимации: объект-ссылка, null или строка-цвет.
 * Цвет ищется в текстуре, а если его там нет — занимает первую свободную клетку.
 */
function toSlideValue(input: unknown): SlideCell {
  if (input === null || input === undefined) return null;
  if (typeof input === 'string') return store().ensureColorRef(input);
  return toRef(input);
}

/** Рисует набор точек текущим способом (цветом или ссылкой). */
function paintPoints(points: Point[], color?: unknown): void {
  const state = store();
  if (isTextureSurface(state)) {
    const previous = state.color;
    if (color !== undefined) state.setColor(color);
    store().paint(points);
    if (color !== undefined) store().setColor(previous);
    return;
  }
  const previous = state.currentRef;
  if (color !== undefined) store().setRef(toSlideValue(color));
  store().paint(points);
  if (color !== undefined) store().setRef(previous);
}

/** Публичный интерфейс агента. */
export interface PixelmationApi {
  readonly version: string;
  help(): string[];
  state(): ReturnType<typeof summary>;

  preview(options?: { rulers?: boolean; slide?: number }): string;
  legend(): Array<{ symbol: string; color: string; count: number }>;
  palette(): Array<{ color: string; count: number }>;
  pngDataUrl(options?: { scale?: number; slide?: number; background?: string | null }): string;
  gifDataUrl(options?: { scale?: number; delayMs?: number }): string;

  newTexture(width: number, height: number, name?: string): ReturnType<typeof summary>;
  newAnimation(width: number, height: number, name?: string): ReturnType<typeof summary>;
  openFile(fileName: string, content: string): ReturnType<typeof summary>;
  loadTexture(data: unknown): ReturnType<typeof summary>;
  loadAnimation(data: unknown): ReturnType<typeof summary>;
  close(): ReturnType<typeof summary>;
  setName(name: string): ReturnType<typeof summary>;

  setColor(color: unknown): ReturnType<typeof summary>;
  setRef(ref: unknown): ReturnType<typeof summary>;
  setTool(tool: Tool): ReturnType<typeof summary>;
  pick(x: number, y: number): ReturnType<typeof summary>;

  setPixel(x: number, y: number, color?: unknown): ReturnType<typeof summary>;
  setPixels(points: unknown, color?: unknown): ReturnType<typeof summary>;
  erase(points: unknown): ReturnType<typeof summary>;
  line(x0: number, y0: number, x1: number, y1: number, color?: unknown): ReturnType<typeof summary>;
  rect(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color?: unknown,
    filled?: boolean,
  ): ReturnType<typeof summary>;
  ellipse(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color?: unknown,
    filled?: boolean,
  ): ReturnType<typeof summary>;
  fill(x: number, y: number, color?: unknown): ReturnType<typeof summary>;
  drawAscii(
    rows: string[],
    legend: Record<string, unknown>,
    origin?: { x?: number; y?: number },
  ): ReturnType<typeof summary>;
  clear(): ReturnType<typeof summary>;
  shift(dx: number, dy: number, options?: { wrap?: boolean }): ReturnType<typeof summary>;
  resize(width: number, height: number): ReturnType<typeof summary>;

  slides(): Array<{ index: number; painted: number }>;
  gotoSlide(index: number): ReturnType<typeof summary>;
  nextSlide(): ReturnType<typeof summary>;
  prevSlide(): ReturnType<typeof summary>;
  addSlide(): ReturnType<typeof summary>;
  duplicateSlide(): ReturnType<typeof summary>;
  deleteSlide(): ReturnType<typeof summary>;
  moveSlide(from: number, to: number): ReturnType<typeof summary>;
  insertTextureSlide(): ReturnType<typeof summary>;
  editTexture(on?: boolean): ReturnType<typeof summary>;

  undo(): ReturnType<typeof summary>;
  redo(): ReturnType<typeof summary>;
  toJSON(): string;
  textureJSON(): string;
  download(options?: { legacy?: boolean }): ReturnType<typeof summary>;
  setGrid(value: boolean): ReturnType<typeof summary>;
  setTheme(theme: 'dark' | 'light'): ReturnType<typeof summary>;
  setSpeed(ms: number): ReturnType<typeof summary>;
  play(value?: boolean): ReturnType<typeof summary>;
  say(text: string): ReturnType<typeof summary>;
}

/** Собирает объект API. Вынесено отдельно, чтобы это же использовалось в тестах. */
export function createAgentApi(): PixelmationApi {
  const api: PixelmationApi = {
    version: '2.0',

    help: () => [
      'pixelmation.state() — сводка: режим, размер, кадр, число пикселей',
      'pixelmation.preview({rulers:true}) — текстовая карта холста',
      'pixelmation.legend() — какой символ какому цвету соответствует',
      'pixelmation.newTexture(32,32,"герой") / newAnimation(32,32,"бег")',
      'pixelmation.openFile("hero.pxlmt", json) — открыть содержимое файла',
      'pixelmation.setColor("#ff0000ff") / setRef({x,y}) / setTool("pen")',
      'pixelmation.setPixel(x,y,color?) / setPixels([[x,y],...], color?) / erase(points)',
      'pixelmation.line(x0,y0,x1,y1,color?) / rect(...,filled?) / ellipse(...,filled?)',
      'pixelmation.fill(x,y,color?) / clear() / shift(dx,dy,{wrap}) / resize(w,h)',
      'pixelmation.drawAscii(["..#","#.#"], {"#":"#ff0000ff"}, {x:0,y:0}) — целый рисунок за раз',
      'pixelmation.addSlide() / duplicateSlide() / deleteSlide() / moveSlide(a,b) / gotoSlide(i)',
      'pixelmation.editTexture(true|false) — правка текстуры внутри анимации',
      'pixelmation.pngDataUrl({scale:8}) / gifDataUrl({scale:8,delayMs:150})',
      'pixelmation.toJSON() / textureJSON() / download({legacy:false})',
      'pixelmation.undo() / redo() / play(true) / setSpeed(150)',
    ],

    state: () => summary(),

    preview: (options = {}) => {
      requireDocument();
      const state = store();
      const cells =
        options.slide === undefined
          ? activeCells()
          : resolveSlide(state.slides[options.slide] ?? [], state.texture);
      return options.rulers ? asciiPreviewWithRulers(cells) : asciiPreview(cells).text;
    },

    legend: () => asciiPreview(activeCells()).legend,

    palette: () => texturePalette(store().texture),

    pngDataUrl: (options = {}) => {
      requireDocument();
      const state = store();
      const cells =
        options.slide === undefined
          ? activeCells()
          : resolveSlide(state.slides[options.slide] ?? [], state.texture);
      const background = options.background === undefined ? null : normalizeColor(options.background);
      return imageToDataUrl(renderCells(cells, { scale: options.scale ?? 8, background }));
    },

    gifDataUrl: (options = {}) => {
      const state = store();
      if (state.mode !== 'animation') throw new Error('GIF собирается только из анимации');
      const gif = buildGif(toAnimation(state), {
        scale: options.scale ?? 8,
        delayMs: options.delayMs ?? state.speed,
      });
      let binary = '';
      for (const byte of gif) binary += String.fromCharCode(byte);
      return `data:image/gif;base64,${btoa(binary)}`;
    },

    newTexture: (width, height, name = '') => {
      store().newDocument('texture', width, height, name);
      return summary();
    },

    newAnimation: (width, height, name = '') => {
      store().newDocument('animation', width, height, name);
      return summary();
    },

    openFile: (fileName, content) => {
      const result = parseProjectFile(fileName, content);
      if (result.kind === 'texture') store().loadTexture(result.texture);
      else store().loadAnimation(result.animation);
      return summary();
    },

    loadTexture: (data) => {
      const texture: Texture = parseTexture(typeof data === 'string' ? data : JSON.stringify(data));
      store().loadTexture(texture);
      return summary();
    },

    loadAnimation: (data) => {
      const animation: Animation = parseAnimation(
        typeof data === 'string' ? data : JSON.stringify(data),
      );
      store().loadAnimation(animation);
      return summary();
    },

    close: () => {
      store().closeDocument();
      return summary();
    },

    setName: (name) => {
      store().setName(String(name));
      return summary();
    },

    setColor: (color) => {
      store().setColor(color);
      return summary();
    },

    setRef: (ref) => {
      store().setRef(toSlideValue(ref));
      return summary();
    },

    setTool: (tool) => {
      store().setTool(tool);
      return summary();
    },

    pick: (x, y) => {
      store().pick({ x, y });
      return summary();
    },

    setPixel: (x, y, color) => {
      requireDocument();
      paintPoints([{ x, y }], color);
      return summary();
    },

    setPixels: (points, color) => {
      requireDocument();
      paintPoints(pointsFrom(points), color);
      return summary();
    },

    erase: (points) => {
      requireDocument();
      store().erase(pointsFrom(points));
      return summary();
    },

    line: (x0, y0, x1, y1, color) => {
      requireDocument();
      paintPoints(linePoints(x0, y0, x1, y1), color);
      return summary();
    },

    rect: (x0, y0, x1, y1, color, filled = false) => {
      requireDocument();
      paintPoints(rectPoints(x0, y0, x1, y1, filled), color);
      return summary();
    },

    ellipse: (x0, y0, x1, y1, color, filled = false) => {
      requireDocument();
      paintPoints(ellipsePoints(x0, y0, x1, y1, filled), color);
      return summary();
    },

    fill: (x, y, color) => {
      requireDocument();
      const state = store();
      if (isTextureSurface(state)) {
        const previous = state.color;
        if (color !== undefined) state.setColor(color);
        store().fillAt({ x, y });
        if (color !== undefined) store().setColor(previous);
      } else {
        const previous = state.currentRef;
        if (color !== undefined) store().setRef(toSlideValue(color));
        store().fillAt({ x, y });
        if (color !== undefined) store().setRef(previous);
      }
      return summary();
    },

    drawAscii: (rows, legend, origin = {}) => {
      requireDocument();
      if (!Array.isArray(rows)) throw new Error('rows должен быть массивом строк');
      const startX = origin.x ?? 0;
      const startY = origin.y ?? 0;
      const state = store();
      const onTexture = isTextureSurface(state);

      /** Группируем клетки по значению, чтобы сделать по одному вызову на цвет. */
      const groups = new Map<string, Point[]>();
      const values = new Map<string, unknown>();
      rows.forEach((row, rowIndex) => {
        [...String(row)].forEach((symbol, columnIndex) => {
          if (!(symbol in legend)) return;
          const raw = legend[symbol];
          const key = JSON.stringify(raw ?? null);
          if (!groups.has(key)) {
            groups.set(key, []);
            values.set(key, raw ?? null);
          }
          groups.get(key)!.push({ x: startX + columnIndex, y: startY + rowIndex });
        });
      });

      store().beginStroke();
      try {
        for (const [key, points] of groups) {
          const raw = values.get(key);
          if (raw === null) {
            store().erase(points);
          } else if (onTexture) {
            paintPoints(points, raw);
          } else {
            paintPoints(points, toSlideValue(raw));
          }
        }
      } finally {
        store().endStroke();
      }
      return summary();
    },

    clear: () => {
      requireDocument();
      store().clearCanvas();
      return summary();
    },

    shift: (dx, dy, options = {}) => {
      requireDocument();
      const state = store();
      const previous = state.wrapShift;
      if (options.wrap !== undefined) state.setWrapShift(Boolean(options.wrap));
      store().shiftBy(dx, dy);
      if (options.wrap !== undefined) store().setWrapShift(previous);
      return summary();
    },

    resize: (width, height) => {
      requireDocument();
      store().resizeDocument(width, height);
      return summary();
    },

    slides: () =>
      store().slides.map((slide, index) => ({ index, painted: countPaintedRefs(slide) })),

    gotoSlide: (index) => {
      store().gotoSlide(index);
      return summary();
    },
    nextSlide: () => {
      store().nextSlide();
      return summary();
    },
    prevSlide: () => {
      store().prevSlide();
      return summary();
    },
    addSlide: () => {
      store().addSlide();
      return summary();
    },
    duplicateSlide: () => {
      store().duplicateSlide();
      return summary();
    },
    deleteSlide: () => {
      store().deleteSlide();
      return summary();
    },
    moveSlide: (from, to) => {
      store().moveSlide(from, to);
      return summary();
    },
    insertTextureSlide: () => {
      store().insertTextureSlide();
      return summary();
    },
    editTexture: (on = true) => {
      store().setAnimationTab(on ? 'texture' : 'slides');
      return summary();
    },

    undo: () => {
      store().undo();
      return summary();
    },
    redo: () => {
      store().redo();
      return summary();
    },

    toJSON: () => {
      const state = store();
      if (state.mode === 'animation') {
        return serializeAnimation(toAnimation(state), { pretty: true });
      }
      return serializeTexture({ ...state.texture, name: state.documentName }, { pretty: true });
    },

    textureJSON: () => {
      const state = store();
      return serializeTexture({ ...state.texture, name: state.texture.name || state.documentName }, {
        pretty: true,
      });
    },

    download: (options = {}) => {
      saveCurrentDocument(options);
      return summary();
    },

    setGrid: (value) => {
      store().setShowGrid(Boolean(value));
      return summary();
    },
    setTheme: (theme) => {
      store().setTheme(theme);
      return summary();
    },
    setSpeed: (ms) => {
      store().setSpeed(ms);
      return summary();
    },
    play: (value = true) => {
      store().setPlaying(Boolean(value));
      return summary();
    },
    say: (text) => {
      toast(String(text));
      return summary();
    },
  };

  return api;
}

declare global {
  interface Window {
    pixelmation?: PixelmationApi;
  }
}

/** Вешает API на `window` и пишет короткую подсказку в консоль. */
export function installAgentApi(): PixelmationApi {
  const api = createAgentApi();
  window.pixelmation = api;
  // eslint-disable-next-line no-console
  console.info('[pixelmation] API агента готов. Список команд: pixelmation.help()');
  return api;
}

/** Реэкспорт типов, чтобы инструменты могли типизировать вызовы. */
export type { Cell, Point, SlideCell };
