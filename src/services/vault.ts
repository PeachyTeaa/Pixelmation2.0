/**
 * Архив восстановления.
 *
 * Всё, над чем работал пользователь, время от времени складывается в IndexedDB:
 * последние 300 снимков документов. Оттуда работу можно вернуть в редактор или
 * скачать файлом, даже если её случайно стёрли или закрыли вкладку.
 *
 * Хранилище разбито на две таблицы: маленькие карточки (`meta`) читаются целиком
 * и мгновенно, тяжёлое содержимое (`data`) подгружается по требованию.
 */
import {
  countPainted,
  countPaintedRefs,
  parseAnimation,
  parseTexture,
  serializeAnimation,
  serializeTexture,
  textureSize,
  type Animation,
  type Slide,
  type Texture,
} from '~/core';

const DB_NAME = 'pixelmation.vault';
const DB_VERSION = 1;
const META_STORE = 'meta';
const DATA_STORE = 'data';

/** Сколько снимков храним. */
export const VAULT_LIMIT = 300;

/** Карточка снимка: всё, что нужно списку, без тяжёлых данных. */
export interface VaultMeta {
  id: number;
  createdAt: number;
  kind: 'texture' | 'animation';
  name: string;
  width: number;
  height: number;
  /** Кадров в анимации; у текстуры всегда 1. */
  frames: number;
  /** Закрашенных клеток: в анимации — суммарно по кадрам. */
  painted: number;
  /** Отпечаток содержимого — по нему отсеиваются повторы. */
  hash: number;
  /** Размер сохранённого JSON в байтах. */
  bytes: number;
}

/** Документ, который просят сохранить. */
export interface VaultInput {
  kind: 'texture' | 'animation';
  texture: Texture;
  slides: Slide[];
  name: string;
}

/** Снимок вместе с разобранным содержимым. */
export type VaultRecord =
  | { meta: VaultMeta; kind: 'texture'; texture: Texture }
  | { meta: VaultMeta; kind: 'animation'; animation: Animation };

/** Доступен ли архив в этом окружении. */
export function isVaultAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!isVaultAvailable()) return Promise.reject(new Error('IndexedDB недоступна'));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        const meta = db.createObjectStore(META_STORE, { keyPath: 'id' });
        meta.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        db.createObjectStore(DATA_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть архив'));
  });

  return dbPromise;
}

/** Сбрасывает кеш соединения — нужен тестам. */
export function resetVaultConnection(): void {
  dbPromise = null;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Ошибка архива'));
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Транзакция прервана'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Ошибка транзакции'));
  });
}

/** Быстрый отпечаток строки (djb2). Нужен только для сравнения снимков между собой. */
export function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  return hash >>> 0;
}

function serialize(input: VaultInput): string {
  // Внутри архива храним компактную RLE-запись: пиксель-арт сжимается в разы.
  if (input.kind === 'animation') {
    const animation: Animation = { name: input.name, slides: input.slides, texture: input.texture };
    return serializeAnimation(animation, { legacy: true });
  }
  return serializeTexture({ ...input.texture, name: input.name }, { legacy: true });
}

function describe(input: VaultInput, json: string, id: number): VaultMeta {
  const size = textureSize(input.texture);
  const painted =
    input.kind === 'animation'
      ? input.slides.reduce((total, slide) => total + countPaintedRefs(slide), 0)
      : countPainted(input.texture);

  return {
    id,
    createdAt: id,
    kind: input.kind,
    name: input.name,
    width: size.width,
    height: size.height,
    frames: input.kind === 'animation' ? input.slides.length : 1,
    painted,
    hash: hashString(json),
    bytes: json.length,
  };
}

/** Есть ли в документе хоть что-то, что стоит хранить. */
export function isWorthSaving(input: VaultInput): boolean {
  const size = textureSize(input.texture);
  if (size.width === 0 || size.height === 0) return false;
  if (input.kind === 'texture') return countPainted(input.texture) > 0;
  return input.slides.some((slide) => countPaintedRefs(slide) > 0);
}

/**
 * Кладёт снимок в архив. Возвращает карточку или `null`, если сохранять нечего
 * (пустой холст или точно такой же снимок уже лежит сверху).
 */
export async function saveSnapshot(input: VaultInput): Promise<VaultMeta | null> {
  if (!isVaultAvailable() || !isWorthSaving(input)) return null;

  const json = serialize(input);
  const hash = hashString(json);
  const existing = await listSnapshots();
  // Повторов не держим: одно и то же состояние занимает место и мешает искать.
  if (existing.some((meta) => meta.hash === hash)) return null;

  const db = await openDatabase();
  const id = Math.max(Date.now(), (existing[0]?.id ?? 0) + 1);
  const meta = describe(input, json, id);

  const transaction = db.transaction([META_STORE, DATA_STORE], 'readwrite');
  transaction.objectStore(META_STORE).put(meta);
  transaction.objectStore(DATA_STORE).put({ id, json });
  await done(transaction);

  await prune(db);
  return meta;
}

/** Удаляет самые старые снимки, если их стало больше лимита. */
async function prune(db: IDBDatabase): Promise<void> {
  const transaction = db.transaction([META_STORE, DATA_STORE], 'readwrite');
  // Обработчик завершения вешаем сразу: транзакция может закрыться раньше, чем
  // мы доберёмся до конца, и тогда событие уже не поймать.
  const completion = done(transaction);
  const metaStore = transaction.objectStore(META_STORE);
  const total = await promisify(metaStore.count());
  if (total <= VAULT_LIMIT) {
    await completion;
    return;
  }

  let toDelete = total - VAULT_LIMIT;
  const dataStore = transaction.objectStore(DATA_STORE);
  const cursorRequest = metaStore.index('createdAt').openCursor();
  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || toDelete <= 0) {
        resolve();
        return;
      }
      const { id } = cursor.value as VaultMeta;
      metaStore.delete(id);
      dataStore.delete(id);
      toDelete--;
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('Ошибка очистки архива'));
  });
  await completion;
}

/** Список снимков, новые сверху. */
export async function listSnapshots(limit = VAULT_LIMIT): Promise<VaultMeta[]> {
  if (!isVaultAvailable()) return [];
  const db = await openDatabase();
  const transaction = db.transaction(META_STORE, 'readonly');
  const store = transaction.objectStore(META_STORE);
  const all = (await promisify(store.getAll())) as VaultMeta[];
  return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

/** Полное содержимое снимка. */
export async function readSnapshot(id: number): Promise<VaultRecord | null> {
  if (!isVaultAvailable()) return null;
  const db = await openDatabase();
  const transaction = db.transaction([META_STORE, DATA_STORE], 'readonly');
  const meta = (await promisify(transaction.objectStore(META_STORE).get(id))) as VaultMeta | undefined;
  const data = (await promisify(transaction.objectStore(DATA_STORE).get(id))) as
    | { id: number; json: string }
    | undefined;
  if (!meta || !data) return null;

  if (meta.kind === 'animation') {
    return { meta, kind: 'animation', animation: parseAnimation(data.json) };
  }
  return { meta, kind: 'texture', texture: parseTexture(data.json) };
}

/** Удаляет один снимок. */
export async function deleteSnapshot(id: number): Promise<void> {
  if (!isVaultAvailable()) return;
  const db = await openDatabase();
  const transaction = db.transaction([META_STORE, DATA_STORE], 'readwrite');
  transaction.objectStore(META_STORE).delete(id);
  transaction.objectStore(DATA_STORE).delete(id);
  await done(transaction);
}

/** Полностью очищает архив. */
export async function clearSnapshots(): Promise<void> {
  if (!isVaultAvailable()) return;
  const db = await openDatabase();
  const transaction = db.transaction([META_STORE, DATA_STORE], 'readwrite');
  transaction.objectStore(META_STORE).clear();
  transaction.objectStore(DATA_STORE).clear();
  await done(transaction);
}
