import type { Animation, HexColor, Point, Slide, Texture } from '~/core';

/** Экран приложения. */
export type Screen = 'home' | 'texture' | 'animation';

/** Инструмент рисования. */
export type Tool = 'pen' | 'eraser' | 'fill' | 'line' | 'rect' | 'ellipse' | 'picker' | 'move';

/** Что сейчас редактируется в режиме анимации. */
export type AnimationTab = 'slides' | 'texture';

/** Снимок документа для истории отмен. */
export interface Snapshot {
  texture: Texture;
  slides: Slide[];
  currentSlide: number;
  documentName: string;
}

/** Данные документа без служебных полей. */
export interface DocumentState {
  /** `null` — открыт стартовый экран. */
  mode: 'texture' | 'animation' | null;
  /** Активная текстура. В режиме анимации это же — текстура анимации. */
  texture: Texture;
  /** Кадры анимации (в режиме текстуры пустой массив). */
  slides: Slide[];
  /** Имя документа (текстуры или анимации). */
  documentName: string;
  /** Индекс текущего кадра. */
  currentSlide: number;
}

/** Готовый объект анимации, собранный из состояния. */
export type ActiveAnimation = Animation;

/** Ссылка, выбранная пипеткой в режиме анимации. */
export type ActiveRef = Point | null;

/** Текущий цвет: `null` означает прозрачность (клавиша E). */
export type ActiveColor = HexColor | null;
