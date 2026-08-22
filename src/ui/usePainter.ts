import { useCallback, useEffect, useRef, useState } from 'react';
import { ellipsePoints, linePoints, rectPoints, resolveRef, type Cell, type Point } from '~/core';
import { isTextureSurface, useEditorStore } from '~/state/store';
import type { CanvasButton } from './PixelCanvas';

interface DragState {
  start: Point;
  last: Point;
}

const isShape = (tool: string): boolean => tool === 'line' || tool === 'rect' || tool === 'ellipse';

/**
 * Переводит события холста в действия store с учётом выбранного инструмента.
 * Одинаково работает и для текстуры, и для кадра анимации.
 */
export function usePainter() {
  const tool = useEditorStore((state) => state.tool);
  const [preview, setPreview] = useState<Point[]>([]);
  const dragRef = useRef<DragState | null>(null);

  const shapePoints = useCallback((from: Point, to: Point): Point[] => {
    const { tool: current, fillShape } = useEditorStore.getState();
    if (current === 'line') return linePoints(from.x, from.y, to.x, to.y);
    if (current === 'rect') return rectPoints(from.x, from.y, to.x, to.y, fillShape);
    if (current === 'ellipse') return ellipsePoints(from.x, from.y, to.x, to.y, fillShape);
    return [];
  }, []);

  const onCellDown = useCallback(
    (point: Point, button: CanvasButton) => {
      const state = useEditorStore.getState();
      if (button === 'right' || state.tool === 'picker') {
        state.pick(point);
        return;
      }

      state.beginStroke();
      dragRef.current = { start: point, last: point };

      switch (state.tool) {
        case 'pen':
          state.paint([point]);
          break;
        case 'eraser':
          state.erase([point]);
          break;
        case 'fill':
          state.fillAt(point);
          state.endStroke();
          dragRef.current = null;
          break;
        case 'line':
        case 'rect':
        case 'ellipse':
          setPreview(shapePoints(point, point));
          break;
        case 'move':
          break;
      }
    },
    [shapePoints],
  );

  const onCellMove = useCallback(
    (point: Point, buttons: number) => {
      const drag = dragRef.current;
      if (!drag || buttons === 0) return;
      const state = useEditorStore.getState();

      switch (state.tool) {
        case 'pen':
          state.paint(linePoints(drag.last.x, drag.last.y, point.x, point.y));
          break;
        case 'eraser':
          state.erase(linePoints(drag.last.x, drag.last.y, point.x, point.y));
          break;
        case 'move': {
          const dx = point.x - drag.last.x;
          const dy = point.y - drag.last.y;
          if (dx !== 0 || dy !== 0) state.shiftBy(dx, dy);
          break;
        }
        case 'line':
        case 'rect':
        case 'ellipse':
          setPreview(shapePoints(drag.start, point));
          break;
        default:
          break;
      }
      drag.last = point;
    },
    [shapePoints],
  );

  const onCellUp = useCallback(
    (point: Point | null) => {
      const drag = dragRef.current;
      dragRef.current = null;
      const state = useEditorStore.getState();
      if (!drag) return;

      if (isShape(state.tool)) {
        const points = shapePoints(drag.start, point ?? drag.last);
        state.paint(points);
        setPreview([]);
      }
      state.endStroke();
    },
    [shapePoints],
  );

  /**
   * Страховка на случай, когда кнопку отпустили мимо холста: захват указателя
   * теряется, `onCellUp` не приходит, и незакрытый мазок отключает историю —
   * отменять становится нечего. Событие с холста сюда тоже доходит, но там
   * мазок уже закрыт и `dragRef` пуст, так что второй раз ничего не случится.
   */
  useEffect(() => {
    const finish = (): void => {
      if (dragRef.current) onCellUp(null);
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
    };
  }, [onCellUp]);

  const previewColor = usePreviewColor();

  return {
    preview,
    previewColor,
    cursor: tool === 'move' ? ('move' as const) : tool === 'picker' ? ('picker' as const) : ('draw' as const),
    handlers: { onCellDown, onCellMove, onCellUp },
  };
}

/** Цвет, которым рисуется предпросмотр фигуры. */
function usePreviewColor(): Cell {
  return useEditorStore((state) => {
    if (isTextureSurface(state)) return state.color;
    return resolveRef(state.texture, state.currentRef);
  });
}
