/** Сохранение текущего документа в файл проекта. */
import type { Animation, Texture } from '~/core';
import { toAnimation, useEditorStore } from '~/state/store';
import { saveAnimation, saveTexture } from './files';
import { toast, toastError } from './toast';

/** Текстура текущего документа с актуальным именем. */
export function currentTexture(): Texture {
  const state = useEditorStore.getState();
  return { ...state.texture, name: state.texture.name || state.documentName };
}

/** Анимация текущего документа. */
export function currentAnimation(): Animation {
  const state = useEditorStore.getState();
  const animation = toAnimation(state);
  return { ...animation, texture: { ...animation.texture, name: animation.texture.name || state.documentName } };
}

/** Сохраняет открытый документ (Ctrl+S). */
export function saveCurrentDocument(): void {
  const state = useEditorStore.getState();
  if (!state.mode) return;
  try {
    const fileName =
      state.mode === 'texture'
        ? saveTexture({ ...currentTexture(), name: state.documentName })
        : saveAnimation(currentAnimation());
    state.markSaved();
    toast(`Сохранено: ${fileName}`);
  } catch (error) {
    toastError(error);
  }
}
