import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '~/state/store';
import { usePainter } from './usePainter';

const store = () => useEditorStore.getState();

const point = { x: 1, y: 1 };

describe('мазок кистью', () => {
  beforeEach(() => {
    localStorage.clear();
    store().newDocument('texture', 4, 4, 'тест');
    store().setColor('#ff0000ff');
  });

  it('обычный мазок пишет в историю один раз', () => {
    const { result } = renderHook(() => usePainter());

    result.current.handlers.onCellDown(point, 'left');
    result.current.handlers.onCellMove({ x: 2, y: 1 }, 1);
    result.current.handlers.onCellUp({ x: 2, y: 1 });

    expect(store().strokeDepth).toBe(0);
    expect(store().past).toHaveLength(1);
  });

  it('кнопку отпустили мимо холста — мазок всё равно закрыт', () => {
    const { result } = renderHook(() => usePainter());

    result.current.handlers.onCellDown(point, 'left');
    // Захват указателя потерян: onCellUp по холсту не придёт, только событие окна.
    window.dispatchEvent(new Event('pointerup'));

    expect(store().strokeDepth).toBe(0);

    // Следующее изменение обязано попасть в историю.
    store().paint([{ x: 3, y: 3 }]);
    expect(store().past).toHaveLength(2);
  });

  it('отмена указателя тоже закрывает мазок', () => {
    const { result } = renderHook(() => usePainter());

    result.current.handlers.onCellDown(point, 'left');
    window.dispatchEvent(new Event('pointercancel'));

    expect(store().strokeDepth).toBe(0);
  });
});
