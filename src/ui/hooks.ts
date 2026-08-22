import { useEffect, useState } from 'react';
import { useEditorStore } from '~/state/store';
import { readProjectFile } from '~/services/files';
import { rememberTarget } from '~/services/fileTarget';
import { toast, toastError } from '~/services/toast';

/** Не перехватываем горячие клавиши, пока пользователь печатает. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

export interface HotkeyHandlers {
  onSave: () => void;
  onSaveAs: () => void;
  onToggleHelp: () => void;
}

/**
 * Горячие клавиши редактора.
 *
 * A / ← и D / → — слайды по кругу, Ctrl+Z и Ctrl+Shift+Z — история,
 * Ctrl+S — сохранение поверх файла, Ctrl+Shift+S — сохранение как копии,
 * E — прозрачный цвет, G — заливка, F — перемещение.
 */
export function useHotkeys({ onSave, onSaveAs, onToggleHelp }: HotkeyHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const state = useEditorStore.getState();
      if (state.mode === null) return;
      const isAnimation = state.mode === 'animation' && state.animationTab === 'slides';
      // Ориентируемся на физическую клавишу, а не на букву: иначе на русской
      // раскладке Ctrl+S приходит как «ы», и ни один бинд не срабатывает.
      const code = event.code;

      if (event.ctrlKey || event.metaKey) {
        switch (code) {
          case 'KeyZ':
            event.preventDefault();
            if (event.shiftKey) state.redo();
            else state.undo();
            return;
          case 'KeyY':
            event.preventDefault();
            state.redo();
            return;
          case 'KeyS':
            event.preventDefault();
            if (event.shiftKey) onSaveAs();
            else onSave();
            return;
          default:
            return;
        }
      }

      if (event.altKey) return;

      switch (code) {
        case 'KeyA':
        case 'ArrowLeft':
          if (isAnimation) {
            event.preventDefault();
            state.prevSlide();
          }
          return;
        case 'KeyD':
        case 'ArrowRight':
          if (isAnimation) {
            event.preventDefault();
            state.nextSlide();
          }
          return;
        case 'KeyE':
          event.preventDefault();
          if (isAnimation) state.setRef(null);
          else state.setTransparentColor();
          return;
        case 'KeyG':
          event.preventDefault();
          if (event.shiftKey) state.toggleGrid();
          else state.setTool('fill');
          return;
        case 'KeyF':
          event.preventDefault();
          state.setTool('move');
          return;
        case 'KeyB':
          state.setTool('pen');
          return;
        case 'KeyX':
          state.setTool('eraser');
          return;
        case 'KeyI':
          state.setTool('picker');
          return;
        case 'KeyL':
          state.setTool('line');
          return;
        case 'KeyR':
          state.setTool('rect');
          return;
        case 'KeyO':
          state.setTool('ellipse');
          return;
        case 'Space':
          if (isAnimation) {
            event.preventDefault();
            state.setPlaying(!state.isPlaying);
          }
          return;
        case 'Slash':
          if (event.shiftKey) {
            event.preventDefault();
            onToggleHelp();
          }
          return;
        default:
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSave, onSaveAs, onToggleHelp]);
}

/** Предупреждение о несохранённом прогрессе при закрытии вкладки. */
export function useUnsavedWarning(): void {
  const dirty = useEditorStore((state) => state.dirty);
  const mode = useEditorStore((state) => state.mode);

  useEffect(() => {
    if (!dirty || mode === null) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, mode]);
}

/** Дескриптор перетащенного файла — там, где браузер умеет его отдать. */
async function fileHandleOf(item: DataTransferItem | undefined): Promise<FileSystemFileHandle | null> {
  const get = (item as { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> } | undefined)
    ?.getAsFileSystemHandle;
  if (!get || !item) return null;
  try {
    const handle = await get.call(item);
    return handle && handle.kind === 'file' ? (handle as FileSystemFileHandle) : null;
  } catch {
    return null;
  }
}

/** Перетаскивание файлов проекта в окно. */
export function useFileDrop(): boolean {
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    let depth = 0;

    const onDragEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      depth++;
      setIsOver(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsOver(false);
    };
    const onDrop = async (event: DragEvent) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      depth = 0;
      setIsOver(false);
      const file = event.dataTransfer.files[0];
      // Перетаскивание тоже может дать дескриптор — тогда Ctrl+S пишет в этот файл.
      const handle = await fileHandleOf(event.dataTransfer.items[0]);
      try {
        const result = await readProjectFile(file);
        const store = useEditorStore.getState();
        if (result.kind === 'texture') {
          store.loadTexture(result.texture);
          toast(`Текстура «${result.texture.name || file.name}» загружена`);
        } else {
          store.loadAnimation(result.animation);
          toast(`Анимация «${result.animation.name || file.name}» загружена`);
        }
        if (handle) {
          await rememberTarget(handle);
          useEditorStore.getState().setSaveTarget(handle.name);
        }
      } catch (error) {
        toastError(error);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return isOver;
}

/** Проигрывание анимации: крутит слайды с выбранной скоростью. */
export function usePlayback(): void {
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const speed = useEditorStore((state) => state.speed);
  const total = useEditorStore((state) => state.slides.length);

  useEffect(() => {
    if (!isPlaying || total < 2) return;
    const timer = window.setInterval(() => useEditorStore.getState().nextSlide(), speed);
    return () => window.clearInterval(timer);
  }, [isPlaying, speed, total]);
}

/** Держит класс темы на <html> в согласии со store. */
export function useThemeClass(): void {
  const theme = useEditorStore((state) => state.theme);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('theme-dark', theme === 'dark');
    root.classList.toggle('theme-light', theme === 'light');
    root.dataset.theme = theme;
    try {
      localStorage.setItem('pixelmation.theme', theme);
    } catch {
      // приватный режим — просто не запоминаем
    }
  }, [theme]);
}
