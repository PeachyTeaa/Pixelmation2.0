import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  addSlide as addSlideOp,
  clampCanvasSize,
  createSlide,
  createTexture,
  deleteSlide as deleteSlideOp,
  duplicateSlide as duplicateSlideOp,
  ensureColorRef as ensureColorRefOp,
  fillArea,
  fillRefArea,
  insertSlide as insertSlideOp,
  insertTextureAsSlide,
  moveSlide as moveSlideOp,
  normalizeColor,
  refEquals,
  resizeAnimation,
  resizeTexture,
  sanitizeAnimation,
  setCells,
  setPixels,
  shiftGrid,
  shiftTexture,
  textureSize,
  type Animation,
  type Cell,
  type HexColor,
  type Point,
  type Slide,
  type SlideCell,
  type Texture,
} from '~/core';
import type { ActiveColor, ActiveRef, AnimationTab, DocumentState, Snapshot, Tool } from './types';

/** Сколько шагов истории храним. */
export const HISTORY_LIMIT = 100;

/** Значения по умолчанию для новых документов. */
export const DEFAULT_SIZE = 32;

interface ViewState {
  tool: Tool;
  color: ActiveColor;
  /** Последний непрозрачный цвет — чтобы вернуться после клавиши E. */
  lastColor: HexColor;
  currentRef: ActiveRef;
  showGrid: boolean;
  wrapShift: boolean;
  fillShape: boolean;
  /** Масштаб в пикселях экрана на пиксель холста. `null` — вписать в область. */
  zoom: number | null;
  /** Пользовательский фон приложения. Пустая строка — цвет темы. */
  appBg: string;
  canvasBg: Cell;
  theme: 'dark' | 'light';
  animationTab: AnimationTab;
  isPlaying: boolean;
  speed: number;
}

interface HistoryState {
  past: Snapshot[];
  future: Snapshot[];
  strokeDepth: number;
  dirty: boolean;
}

interface Actions {
  newDocument: (mode: 'texture' | 'animation', width: number, height: number, name?: string) => void;
  loadTexture: (texture: Texture, options?: { asAnimation?: boolean }) => void;
  loadAnimation: (animation: Animation) => void;
  closeDocument: () => void;
  setName: (name: string) => void;

  setTool: (tool: Tool) => void;
  setColor: (color: unknown) => void;
  setTransparentColor: () => void;
  setRef: (ref: ActiveRef) => void;
  setShowGrid: (value: boolean) => void;
  toggleGrid: () => void;
  setWrapShift: (value: boolean) => void;
  setFillShape: (value: boolean) => void;
  setZoom: (zoom: number | null) => void;
  setAppBg: (color: string) => void;
  setCanvasBg: (color: unknown) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setAnimationTab: (tab: AnimationTab) => void;
  setSpeed: (ms: number) => void;
  setPlaying: (value: boolean) => void;

  paint: (points: Point[]) => void;
  erase: (points: Point[]) => void;
  fillAt: (point: Point) => void;
  pick: (point: Point) => void;
  /** Находит (или заводит) в текстуре пиксель нужного цвета и отдаёт ссылку на него. */
  ensureColorRef: (color: unknown) => SlideCell;
  shiftBy: (dx: number, dy: number) => void;
  clearCanvas: () => void;
  resizeDocument: (width: number, height: number) => void;

  gotoSlide: (index: number) => void;
  nextSlide: () => void;
  prevSlide: () => void;
  addSlide: () => void;
  duplicateSlide: () => void;
  deleteSlide: () => void;
  moveSlide: (from: number, to: number) => void;
  insertTextureSlide: () => void;
  copySlide: () => void;
  pasteSlide: (at?: number) => void;

  beginStroke: () => void;
  endStroke: () => void;
  commit: (mutate: (state: EditorState) => Partial<DocumentState>) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
}

export type EditorState = DocumentState & ViewState & HistoryState & Actions & {
  /** Буфер копирования слайдов. */
  slideClipboard: Slide | null;
};

const snapshotOf = (state: DocumentState): Snapshot => ({
  texture: state.texture,
  slides: state.slides,
  currentSlide: state.currentSlide,
  documentName: state.documentName,
});

const sameSnapshot = (a: Snapshot, b: Snapshot): boolean =>
  a.texture === b.texture &&
  a.slides === b.slides &&
  a.currentSlide === b.currentSlide &&
  a.documentName === b.documentName;

/** Собирает объект анимации из плоского состояния. */
export function toAnimation(state: DocumentState): Animation {
  return { name: state.documentName, slides: state.slides, texture: state.texture };
}

/** Разбирает анимацию обратно в плоское состояние. */
function fromAnimation(animation: Animation): Pick<DocumentState, 'texture' | 'slides' | 'documentName'> {
  return { texture: animation.texture, slides: animation.slides, documentName: animation.name };
}

const initialDocument: DocumentState = {
  mode: null,
  texture: createTexture(DEFAULT_SIZE, DEFAULT_SIZE),
  slides: [],
  documentName: '',
  currentSlide: 0,
};

const initialView: ViewState = {
  tool: 'pen',
  color: '#e9ecf2ff',
  lastColor: '#e9ecf2ff',
  currentRef: null,
  showGrid: false,
  wrapShift: false,
  fillShape: false,
  zoom: null,
  appBg: '',
  canvasBg: null,
  theme: 'dark',
  animationTab: 'slides',
  isPlaying: false,
  speed: 200,
};

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => {
      /** Обновляет документ, снимая состояние в историю. */
      const commit: Actions['commit'] = (mutate) => {
        const state = get();
        const before = snapshotOf(state);
        const patch = mutate(state);
        const after = snapshotOf({ ...state, ...patch });
        if (sameSnapshot(before, after)) return;

        const inStroke = state.strokeDepth > 0;
        const past = inStroke ? state.past : [...state.past, before].slice(-HISTORY_LIMIT);
        set({ ...patch, past, future: inStroke ? state.future : [], dirty: true });
      };

      /** Точки → цвет (текстура) или ссылка (анимация). */
      const applyPoints = (points: Point[], value: 'color' | 'empty'): void => {
        const state = get();
        if (points.length === 0) return;
        if (isTextureSurface(state)) {
          const color = value === 'empty' ? null : state.color;
          commit((current) => ({ texture: setPixels(current.texture, points, color) }));
        } else {
          const ref: SlideCell = value === 'empty' ? null : state.currentRef;
          commit((current) => {
            const slide = current.slides[current.currentSlide];
            if (!slide) return {};
            const slides = current.slides.slice();
            slides[current.currentSlide] = setCells(slide, points, ref);
            return { slides };
          });
        }
      };

      return {
        ...initialDocument,
        ...initialView,
        past: [],
        future: [],
        strokeDepth: 0,
        dirty: false,
        slideClipboard: null,

        newDocument: (mode, width, height, name = '') => {
          const texture = createTexture(clampCanvasSize(width), clampCanvasSize(height), name);
          const size = textureSize(texture);
          set({
            mode,
            texture,
            documentName: name,
            slides: mode === 'animation' ? [createSlide(size.width, size.height)] : [],
            currentSlide: 0,
            currentRef: null,
            animationTab: 'slides',
            past: [],
            future: [],
            dirty: false,
            isPlaying: false,
          });
        },

        loadTexture: (texture, options) => {
          const asAnimation = options?.asAnimation ?? false;
          const size = textureSize(texture);
          set({
            mode: asAnimation ? 'animation' : 'texture',
            texture,
            documentName: texture.name,
            slides: asAnimation ? [createSlide(size.width, size.height)] : [],
            currentSlide: 0,
            currentRef: null,
            animationTab: 'slides',
            past: [],
            future: [],
            dirty: false,
            isPlaying: false,
          });
        },

        loadAnimation: (animation) => {
          const safe = sanitizeAnimation(animation);
          set({
            mode: 'animation',
            ...fromAnimation(safe),
            currentSlide: 0,
            currentRef: null,
            animationTab: 'slides',
            past: [],
            future: [],
            dirty: false,
            isPlaying: false,
          });
        },

        closeDocument: () => set({ ...initialDocument, past: [], future: [], dirty: false, isPlaying: false }),

        setName: (name) => commit(() => ({ documentName: name })),

        setTool: (tool) => set({ tool }),

        setColor: (color) => {
          const value = normalizeColor(color);
          set(value === null ? { color: null } : { color: value, lastColor: value });
        },

        setTransparentColor: () => set({ color: null }),

        setRef: (ref) => set({ currentRef: ref }),

        setShowGrid: (showGrid) => set({ showGrid }),
        toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
        setWrapShift: (wrapShift) => set({ wrapShift }),
        setFillShape: (fillShape) => set({ fillShape }),
        setZoom: (zoom) => set({ zoom }),
        setAppBg: (appBg) => set({ appBg }),
        setCanvasBg: (color) => set({ canvasBg: normalizeColor(color) }),
        setTheme: (theme) => set({ theme }),
        setSpeed: (speed) => set({ speed: Math.min(2000, Math.max(20, Math.round(speed))) }),
        setPlaying: (isPlaying) => set({ isPlaying }),

        setAnimationTab: (tab) => {
          const state = get();
          if (state.animationTab === tab) return;
          if (tab === 'slides' && state.mode === 'animation') {
            // Вернулись из редактора текстуры — чистим ссылки на исчезнувшие пиксели.
            const safe = sanitizeAnimation(toAnimation(state));
            set({ animationTab: tab, slides: safe.slides, currentRef: null });
            return;
          }
          set({ animationTab: tab, isPlaying: false });
        },

        paint: (points) => applyPoints(points, 'color'),
        erase: (points) => applyPoints(points, 'empty'),

        fillAt: ({ x, y }) => {
          const state = get();
          if (isTextureSurface(state)) {
            commit((current) => ({ texture: fillArea(current.texture, x, y, current.color) }));
          } else {
            commit((current) => {
              const animation = fillRefArea(toAnimation(current), current.currentSlide, x, y, current.currentRef);
              return { slides: animation.slides };
            });
          }
        },

        pick: ({ x, y }) => {
          const state = get();
          if (isTextureSurface(state)) {
            const cell = state.texture.cells[y]?.[x];
            if (cell === undefined) return;
            get().setColor(cell);
            return;
          }
          const ref = state.slides[state.currentSlide]?.[y]?.[x];
          if (ref === undefined) return;
          set({ currentRef: ref });
        },

        ensureColorRef: (color) => {
          const state = get();
          const { texture, ref } = ensureColorRefOp(state.texture, color);
          if (texture !== state.texture) commit(() => ({ texture }));
          return ref;
        },

        shiftBy: (dx, dy) => {
          const state = get();
          if (isTextureSurface(state)) {
            commit((current) => ({ texture: shiftTexture(current.texture, dx, dy, current.wrapShift) }));
          } else {
            commit((current) => {
              const slide = current.slides[current.currentSlide];
              if (!slide) return {};
              const slides = current.slides.slice();
              slides[current.currentSlide] = shiftGrid<SlideCell>(slide, dx, dy, () => null, current.wrapShift);
              return { slides };
            });
          }
        },

        clearCanvas: () => {
          const state = get();
          if (isTextureSurface(state)) {
            const { width, height } = textureSize(state.texture);
            commit((current) => ({ texture: { ...current.texture, cells: createTexture(width, height).cells } }));
          } else {
            commit((current) => {
              const slide = current.slides[current.currentSlide];
              if (!slide) return {};
              const slides = current.slides.slice();
              slides[current.currentSlide] = createSlide(slide[0]?.length ?? 0, slide.length);
              return { slides };
            });
          }
        },

        resizeDocument: (width, height) => {
          commit((current) => {
            if (current.mode === 'animation') {
              const resized = resizeAnimation(toAnimation(current), width, height);
              return { texture: resized.texture, slides: resized.slides };
            }
            return { texture: resizeTexture(current.texture, width, height) };
          });
        },

        gotoSlide: (index) => {
          const total = get().slides.length;
          if (total === 0) return;
          const next = ((index % total) + total) % total;
          set({ currentSlide: next });
        },

        nextSlide: () => get().gotoSlide(get().currentSlide + 1),
        prevSlide: () => get().gotoSlide(get().currentSlide - 1),

        addSlide: () =>
          commit((current) => {
            const { animation, index } = addSlideOp(toAnimation(current), current.currentSlide);
            return { slides: animation.slides, currentSlide: index };
          }),

        duplicateSlide: () =>
          commit((current) => {
            const { animation, index } = duplicateSlideOp(toAnimation(current), current.currentSlide);
            return { slides: animation.slides, currentSlide: index };
          }),

        deleteSlide: () =>
          commit((current) => {
            const { animation, index } = deleteSlideOp(toAnimation(current), current.currentSlide);
            return { slides: animation.slides, currentSlide: index };
          }),

        moveSlide: (from, to) =>
          commit((current) => {
            const { animation, index } = moveSlideOp(toAnimation(current), from, to);
            return { slides: animation.slides, currentSlide: index };
          }),

        insertTextureSlide: () =>
          commit((current) => {
            const { animation, index } = insertTextureAsSlide(toAnimation(current), current.currentSlide);
            return { slides: animation.slides, currentSlide: index };
          }),

        copySlide: () => {
          const state = get();
          const slide = state.slides[state.currentSlide];
          if (slide) set({ slideClipboard: slide.map((row) => row.slice()) });
        },

        pasteSlide: (at) => {
          const clipboard = get().slideClipboard;
          if (!clipboard) return;
          commit((current) => {
            const target = at ?? current.currentSlide + 1;
            const { animation, index } = insertSlideOp(toAnimation(current), target, clipboard);
            return { slides: animation.slides, currentSlide: index };
          });
        },

        beginStroke: () => {
          const state = get();
          if (state.strokeDepth === 0) {
            set({
              strokeDepth: 1,
              past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
              future: [],
            });
          } else {
            set({ strokeDepth: state.strokeDepth + 1 });
          }
        },

        endStroke: () => {
          const state = get();
          if (state.strokeDepth === 0) return;
          const depth = state.strokeDepth - 1;
          if (depth > 0) {
            set({ strokeDepth: depth });
            return;
          }
          // Мазок ничего не изменил — снимок из истории убираем.
          const last = state.past[state.past.length - 1];
          if (last && sameSnapshot(last, snapshotOf(state))) {
            set({ strokeDepth: 0, past: state.past.slice(0, -1) });
            return;
          }
          set({ strokeDepth: 0 });
        },

        commit,

        undo: () => {
          const state = get();
          const previous = state.past[state.past.length - 1];
          if (!previous) return;
          set({
            ...previous,
            past: state.past.slice(0, -1),
            future: [snapshotOf(state), ...state.future].slice(0, HISTORY_LIMIT),
            currentSlide: clampSlide(previous.currentSlide, previous.slides.length),
            dirty: true,
            strokeDepth: 0,
          });
        },

        redo: () => {
          const state = get();
          const next = state.future[0];
          if (!next) return;
          set({
            ...next,
            past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
            future: state.future.slice(1),
            currentSlide: clampSlide(next.currentSlide, next.slides.length),
            dirty: true,
            strokeDepth: 0,
          });
        },

        markSaved: () => set({ dirty: false }),
      };
    },
    {
      name: 'pixelmation.editor',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Во второй версии сетка стала выключенной по умолчанию — сбрасываем старую настройку.
      migrate: (state, version) => {
        const saved = (state ?? {}) as Partial<EditorState>;
        if (version < 2) return { ...saved, showGrid: false } as EditorState;
        return saved as EditorState;
      },
      // Храним документ и настройки вида; история и проигрывание — состояние сессии.
      partialize: (state) =>
        ({
          mode: state.mode,
          texture: state.texture,
          slides: state.slides,
          documentName: state.documentName,
          currentSlide: state.currentSlide,
          tool: state.tool,
          color: state.color,
          lastColor: state.lastColor,
          currentRef: state.currentRef,
          showGrid: state.showGrid,
          wrapShift: state.wrapShift,
          fillShape: state.fillShape,
          zoom: state.zoom,
          appBg: state.appBg,
          canvasBg: state.canvasBg,
          theme: state.theme,
          animationTab: state.animationTab,
          speed: state.speed,
          dirty: state.dirty,
        }) as EditorState,
    },
  ),
);

function clampSlide(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(index, 0), total - 1);
}

/** Рисуем ли мы сейчас по текстуре (а не по кадру анимации). */
export function isTextureSurface(state: Pick<EditorState, 'mode' | 'animationTab'>): boolean {
  return state.mode === 'texture' || (state.mode === 'animation' && state.animationTab === 'texture');
}

/** Прямой доступ к состоянию вне React — для агента и хоткеев. */
export const editorStore = {
  get: () => useEditorStore.getState(),
  set: useEditorStore.setState,
  subscribe: useEditorStore.subscribe,
};

/** Ссылка равна другой? Реэкспорт, чтобы UI не тянул ядро ради одной функции. */
export { refEquals };
