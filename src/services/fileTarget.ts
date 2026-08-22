/**
 * Целевой файл на диске — тот, поверх которого пишет Ctrl+S.
 *
 * Всё общение с File System Access API собрано здесь: выбор файла, разрешение
 * на запись и сама запись. Дескриптор нельзя положить в localStorage, зато
 * можно в IndexedDB — поэтому привязка переживает перезагрузку вкладки, а при
 * первой записи после неё браузер один раз переспросит разрешение.
 *
 * В Firefox и Safari этого API нет: `isOverwriteSupported()` вернёт false, и
 * сохранение обязано откатиться на скачивание копии.
 */
import { pickFile } from './files';

/** Разрешения на дескриптор — расширение Chromium, в lib.dom его нет. */
declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite';
  }

  interface FileSystemFileHandle {
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  }

  interface FilePickerAcceptType {
    description?: string;
    accept: Record<string, string[]>;
  }

  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: FilePickerAcceptType[];
    }) => Promise<FileSystemFileHandle>;
    showOpenFilePicker?: (options?: {
      multiple?: boolean;
      types?: FilePickerAcceptType[];
    }) => Promise<FileSystemFileHandle[]>;
  }
}

const DB_NAME = 'pixelmation.files';
const DB_VERSION = 1;
const STORE = 'target';
const KEY = 'current';

/** Что предлагаем в системных диалогах. */
export const PROJECT_TYPES: FilePickerAcceptType[] = [
  {
    description: 'Файлы Pixelmation',
    accept: { 'application/json': ['.pxlmt', '.pxlma'] },
  },
];

let target: FileSystemFileHandle | null = null;

/** Умеет ли браузер писать поверх файла, а не только скачивать копии. */
export function isOverwriteSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

/** Текущая цель записи, если она есть. */
export function currentTarget(): FileSystemFileHandle | null {
  return target;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB недоступна'));
  });
}

/** Кладёт или убирает дескриптор в IndexedDB; молча сдаётся, если её нет. */
async function persist(handle: FileSystemFileHandle | null): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      if (handle) store.put(handle, KEY);
      else store.delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Не удалось запомнить файл'));
    });
    db.close();
  } catch {
    // Приватный режим или запрет на хранилище — привязка проживёт один сеанс.
  }
}

/** Запоминает файл как цель записи — и на этот сеанс, и на будущие. */
export async function rememberTarget(handle: FileSystemFileHandle): Promise<void> {
  target = handle;
  await persist(handle);
}

/** Забывает файл: следующий Ctrl+S снова спросит, куда сохранять. */
export async function forgetTarget(): Promise<void> {
  target = null;
  await persist(null);
}

/**
 * Поднимает привязку после перезагрузки вкладки. Отдаёт имя файла или `null`.
 * Разрешение здесь не спрашиваем — браузер требует жеста пользователя,
 * поэтому это откладывается до первой записи.
 */
export async function restoreTarget(): Promise<string | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDatabase();
    const handle = await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as FileSystemFileHandle) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Не удалось прочитать файл'));
    });
    db.close();
    if (!handle) return null;
    target = handle;
    return handle.name;
  } catch {
    return null;
  }
}

/** Спрашивает разрешение на запись, если его ещё нет. */
async function ensureWritable(handle: FileSystemFileHandle): Promise<boolean> {
  const options: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
  if (typeof handle.queryPermission !== 'function') return true;
  if ((await handle.queryPermission(options)) === 'granted') return true;
  return (await handle.requestPermission(options)) === 'granted';
}

/**
 * Пишет текст поверх цели. `false` — цели нет или в записи отказали;
 * во втором случае привязка снимается, чтобы дальше спросили заново.
 */
export async function writeTarget(text: string): Promise<boolean> {
  const handle = target;
  if (!handle) return false;
  if (!(await ensureWritable(handle))) {
    await forgetTarget();
    return false;
  }
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
  return true;
}

/** Системный диалог «сохранить как». `null` — пользователь передумал. */
export async function pickTarget(suggestedName: string): Promise<FileSystemFileHandle | null> {
  const picker = window.showSaveFilePicker;
  if (!picker) return null;
  try {
    return await picker({ suggestedName, types: PROJECT_TYPES });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}

/** Открытый файл вместе с дескриптором, если браузер его дал. */
export interface OpenedProject {
  file: File;
  /** `null` — файл пришёл через обычное поле выбора, писать поверх некуда. */
  handle: FileSystemFileHandle | null;
}

/**
 * Системный диалог открытия. Дескриптор нужен, чтобы Ctrl+S потом писал прямо
 * в открытый файл; там, где API нет, возвращаем файл без него.
 */
export async function openProjectFile(): Promise<OpenedProject | null> {
  const picker = window.showOpenFilePicker;
  if (!picker) {
    const file = await pickFile();
    return file ? { file, handle: null } : null;
  }
  try {
    const [handle] = await picker({ multiple: false, types: PROJECT_TYPES });
    if (!handle) return null;
    return { file: await handle.getFile(), handle };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}
