/** Крошечная шина уведомлений: без контекста и провайдеров. */
import type { ToastMessage } from '~/ui/kit';

type Listener = (items: ToastMessage[]) => void;

let items: ToastMessage[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener(items);
}

/** Показывает сообщение. Возвращает его идентификатор. */
export function toast(text: string, kind: ToastMessage['kind'] = 'info', ttlMs = 3500): number {
  const id = nextId++;
  items = [...items, { id, text, kind }];
  emit();
  setTimeout(() => {
    items = items.filter((item) => item.id !== id);
    emit();
  }, ttlMs);
  return id;
}

/** Сообщение об ошибке — живёт дольше. */
export function toastError(error: unknown): number {
  const text = error instanceof Error ? error.message : String(error);
  return toast(text, 'error', 6000);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts(): ToastMessage[] {
  return items;
}
