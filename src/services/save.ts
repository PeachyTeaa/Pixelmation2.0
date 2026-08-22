/**
 * Сохранение текущего документа.
 *
 * Ctrl+S пишет поверх того же файла, если он уже выбран: копии в «Загрузках»
 * не плодятся. Пока файла нет — спрашиваем, куда класть, и запоминаем ответ.
 * Ctrl+Shift+S спрашивает всегда и делает новый файл целью.
 */
import type { Animation, Texture } from '~/core';
import { toAnimation, useEditorStore } from '~/state/store';
import { animationFile, downloadProjectFile, textureFile, type ProjectFile } from './files';
import {
  currentTarget,
  forgetTarget,
  isOverwriteSupported,
  pickTarget,
  rememberTarget,
  restoreTarget,
  writeTarget,
} from './fileTarget';
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

/** Имя и содержимое файла, которым сейчас является документ. */
function documentFile(): ProjectFile | null {
  const state = useEditorStore.getState();
  if (!state.mode) return null;
  if (state.mode === 'texture') return textureFile({ ...currentTexture(), name: state.documentName });
  return animationFile(currentAnimation());
}

/** Сохраняет документ (Ctrl+S): поверх прежнего файла, если он известен. */
export async function saveCurrentDocument(): Promise<void> {
  const file = documentFile();
  if (!file) return;

  if (!isOverwriteSupported()) {
    downloadCopy(file);
    return;
  }

  if (!currentTarget()) return saveDocumentAs();

  try {
    // Отказ в разрешении на запись снимает привязку — спросим файл заново.
    if (!(await writeTarget(file.json))) return saveDocumentAs();
    const state = useEditorStore.getState();
    state.markSaved();
    toast(`Сохранено поверх: ${state.saveTarget ?? file.fileName}`);
  } catch (error) {
    toastError(error);
  }
}

/** Сохраняет документ новым файлом (Ctrl+Shift+S) и делает его целью. */
export async function saveDocumentAs(): Promise<void> {
  const file = documentFile();
  if (!file) return;

  if (!isOverwriteSupported()) {
    downloadCopy(file);
    return;
  }

  try {
    const handle = await pickTarget(file.fileName);
    if (!handle) return; // передумали — это не ошибка
    await rememberTarget(handle);
    useEditorStore.getState().setSaveTarget(handle.name);
    if (!(await writeTarget(file.json))) return;
    useEditorStore.getState().markSaved();
    toast(`Сохранено: ${handle.name}`);
  } catch (error) {
    toastError(error);
  }
}

/** Запасной путь для браузеров без File System Access API. */
function downloadCopy(file: ProjectFile): void {
  try {
    downloadProjectFile(file);
    useEditorStore.getState().markSaved();
    toast(`Скачана копия ${file.fileName}: этот браузер не умеет писать поверх файла`);
  } catch (error) {
    toastError(error);
  }
}

/**
 * Связывает привязку к файлу с жизнью документа: поднимает её из прошлого
 * сеанса и роняет, как только открыли или создали что-то другое. Запускается
 * один раз при старте приложения, отдаёт функцию остановки.
 */
export function startSaveTarget(): () => void {
  void restoreTarget().then((name) => {
    if (name) useEditorStore.getState().setSaveTarget(name);
  });

  return useEditorStore.subscribe((state, previous) => {
    // Документ сменился — прежний файл больше не наш, писать в него нельзя.
    if (previous.saveTarget !== null && state.saveTarget === null) void forgetTarget();
  });
}
