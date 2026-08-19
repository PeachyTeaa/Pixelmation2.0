/**
 * Когда именно класть работу в архив восстановления.
 *
 * Правила простые: пока пользователь рисует — снимок раз в несколько секунд
 * затишья (и не реже раза в минуту), а если документ заменяют новым или
 * закрывают — предыдущий сохраняется немедленно, до того как исчезнет.
 */
import { useEditorStore, type EditorState } from '~/state/store';
import { saveSnapshot, type VaultInput, type VaultMeta } from './vault';

interface WatcherOptions {
  /** Пауза в работе, после которой делается снимок. */
  idleMs?: number;
  /** Максимум времени между снимками, пока идёт работа. */
  maxMs?: number;
  /** Подменяется в тестах. */
  now?: () => number;
}

function toInput(state: Pick<EditorState, 'mode' | 'texture' | 'slides' | 'documentName'>): VaultInput | null {
  if (state.mode === null) return null;
  return {
    kind: state.mode,
    texture: state.texture,
    slides: state.slides,
    name: state.documentName,
  };
}

/** Документ подменили целиком: сброшенная история при чистом флаге правок. */
function isDocumentReplaced(previous: EditorState, next: EditorState): boolean {
  if (next.past.length !== 0 || next.dirty) return false;
  return previous.texture !== next.texture || previous.mode !== next.mode;
}

function hasContentChanged(previous: EditorState, next: EditorState): boolean {
  return (
    previous.texture !== next.texture ||
    previous.slides !== next.slides ||
    previous.documentName !== next.documentName
  );
}

/** Сохраняет то, что открыто прямо сейчас. */
export async function saveCurrentToVault(): Promise<VaultMeta | null> {
  const input = toInput(useEditorStore.getState());
  if (!input) return null;
  try {
    return await saveSnapshot(input);
  } catch {
    // Архив — подстраховка: если он недоступен, работа продолжается как обычно.
    return null;
  }
}

/** Запускает наблюдение за редактором. Возвращает функцию остановки. */
export function startVaultWatcher(options: WatcherOptions = {}): () => void {
  const idleMs = options.idleMs ?? 8000;
  const maxMs = options.maxMs ?? 60000;
  const now = options.now ?? (() => Date.now());

  let previous = useEditorStore.getState();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingSince = 0;
  let lastSavedAt = 0;

  const store = async (input: VaultInput | null): Promise<void> => {
    if (!input) return;
    try {
      await saveSnapshot(input);
      lastSavedAt = now();
    } catch {
      // молча: архив не должен мешать рисовать
    }
  };

  const flush = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pendingSince = 0;
    void store(toInput(useEditorStore.getState()));
  };

  const schedule = (): void => {
    if (pendingSince === 0) pendingSince = now();
    if (timer) clearTimeout(timer);
    const waited = now() - pendingSince;
    const delay = waited >= maxMs ? 0 : Math.min(idleMs, maxMs - waited);
    timer = setTimeout(flush, delay);
  };

  const unsubscribe = useEditorStore.subscribe((next) => {
    const before = previous;
    previous = next;

    if (isDocumentReplaced(before, next)) {
      // Сначала прячем в архив то, что уходит, и только потом следим за новым.
      void store(toInput(before));
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pendingSince = 0;
      return;
    }

    if (hasContentChanged(before, next)) schedule();
  });

  const onHidden = (): void => {
    if (document.visibilityState === 'hidden') flush();
  };

  const onPageHide = (): void => flush();

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
  }

  // Первый снимок — на случай, если вкладку закроют сразу после восстановления сессии.
  if (lastSavedAt === 0) void store(toInput(previous));

  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
    }
  };
}
