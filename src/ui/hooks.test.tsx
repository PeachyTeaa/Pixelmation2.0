import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '~/state/store';
import { useHotkeys } from './hooks';

const store = () => useEditorStore.getState();

function press(key: string, modifiers: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: key, bubbles: true, ...modifiers }));
}

describe('горячие клавиши сохранения', () => {
  const onSave = vi.fn();
  const onSaveAs = vi.fn();
  const onToggleHelp = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    store().newDocument('texture', 4, 4, 'лиса');
    renderHook(() => useHotkeys({ onSave, onSaveAs, onToggleHelp }));
  });

  it('Ctrl+S сохраняет поверх файла', () => {
    press('KeyS', { ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSaveAs).not.toHaveBeenCalled();
  });

  it('Ctrl+Shift+S сохраняет как новый файл', () => {
    press('KeyS', { ctrlKey: true, shiftKey: true });
    expect(onSaveAs).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Cmd+Shift+S на маке делает то же самое', () => {
    press('KeyS', { metaKey: true, shiftKey: true });
    expect(onSaveAs).toHaveBeenCalledTimes(1);
  });

  it('без модификатора S ничего не сохраняет', () => {
    press('KeyS');
    expect(onSave).not.toHaveBeenCalled();
    expect(onSaveAs).not.toHaveBeenCalled();
  });
});
