import { useCallback, useEffect, useRef, useState } from 'react';
import { renderCells, resolveSlide, type Animation, type Texture } from '~/core';
import { useEditorStore } from '~/state/store';
import { saveAnimation, saveTexture } from '~/services/files';
import { toast, toastError } from '~/services/toast';
import {
  VAULT_LIMIT,
  clearSnapshots,
  deleteSnapshot,
  isVaultAvailable,
  listSnapshots,
  readSnapshot,
  type VaultMeta,
  type VaultRecord,
} from '~/services/vault';
import { saveCurrentToVault } from '~/services/vaultWatcher';
import { Button, Modal } from './kit';
import styles from './VaultModal.module.css';

function formatWhen(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return new Date(timestamp).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/** Превью снимка: текстура рисуется картинкой, анимация проигрывается. */
function VaultPreview({ meta }: { meta: VaultMeta }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [record, setRecord] = useState<VaultRecord | null>(null);
  const [visible, setVisible] = useState(false);
  const frameRef = useRef(0);

  // Тяжёлое содержимое подгружаем, только когда карточка попала на экран.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '120px' },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || record) return;
    let cancelled = false;
    readSnapshot(meta.id)
      .then((loaded) => {
        if (!cancelled) setRecord(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible, record, meta.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !record) return;

    const draw = (): void => {
      const cells =
        record.kind === 'texture'
          ? record.texture.cells
          : resolveSlide(
              record.animation.slides[frameRef.current % record.animation.slides.length],
              record.animation.texture,
            );
      const image = renderCells(cells);
      if (image.width === 0 || image.height === 0) return;
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    };

    draw();
    if (record.kind !== 'animation' || record.animation.slides.length < 2 || !visible) return;

    const timer = window.setInterval(() => {
      frameRef.current += 1;
      draw();
    }, 200);
    return () => window.clearInterval(timer);
  }, [record, visible]);

  return (
    <div className={styles.preview}>
      <canvas
        ref={canvasRef}
        className={styles.previewCanvas}
        style={{ width: '100%', aspectRatio: `${meta.width} / ${meta.height}` }}
      />
    </div>
  );
}

interface VaultModalProps {
  open: boolean;
  onClose: () => void;
}

export function VaultModal({ open, onClose }: VaultModalProps) {
  const [items, setItems] = useState<VaultMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const dirty = useEditorStore((state) => state.dirty);
  const mode = useEditorStore((state) => state.mode);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listSnapshots());
    } catch (error) {
      toastError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Перед показом списка прячем текущую работу — она тоже должна быть в архиве.
    void saveCurrentToVault().then(refresh);
  }, [open, refresh]);

  const restore = async (meta: VaultMeta) => {
    try {
      // Ничего не спрашиваем: то, что открыто сейчас, сначала уходит в этот же архив.
      const kept = mode !== null && dirty ? await saveCurrentToVault() : null;
      const record = await readSnapshot(meta.id);
      if (!record) throw new Error('Снимок не найден');
      const store = useEditorStore.getState();
      if (record.kind === 'texture') store.loadTexture(record.texture as Texture);
      else store.loadAnimation(record.animation as Animation);
      toast(
        kept
          ? `Восстановлено: ${meta.name || 'без имени'}. Прошлая работа осталась в архиве`
          : `Восстановлено: ${meta.name || 'без имени'}`,
      );
      onClose();
    } catch (error) {
      toastError(error);
    }
  };

  const download = async (meta: VaultMeta) => {
    try {
      const record = await readSnapshot(meta.id);
      if (!record) throw new Error('Снимок не найден');
      const fileName =
        record.kind === 'texture'
          ? saveTexture({ ...record.texture, name: record.texture.name || meta.name })
          : saveAnimation({ ...record.animation, name: record.animation.name || meta.name });
      toast(`Скачано: ${fileName}`);
    } catch (error) {
      toastError(error);
    }
  };

  const remove = async (meta: VaultMeta) => {
    try {
      await deleteSnapshot(meta.id);
      setItems((current) => current.filter((item) => item.id !== meta.id));
    } catch (error) {
      toastError(error);
    }
  };

  const clearAll = async () => {
    if (!confirm('Удалить все снимки из архива? Это нельзя отменить.')) return;
    try {
      await clearSnapshots();
      setItems([]);
      toast('Архив очищен');
    } catch (error) {
      toastError(error);
    }
  };

  return (
    <Modal open={open} wide title="Восстановление" onClose={onClose}>
      <div className={styles.head}>
        <p className={styles.hint}>
          Здесь сами собой копятся последние {VAULT_LIMIT} состояний работы — текстуры и анимации,
          в том числе те, что были стёрты или заменены. Снимок можно вернуть в редактор или сразу
          скачать файлом.
        </p>
        <Button size="sm" variant="danger" onClick={clearAll} disabled={items.length === 0}>
          Очистить архив
        </Button>
      </div>

      {!isVaultAvailable() && (
        <div className={styles.empty}>
          Браузер не даёт доступ к локальной базе — архив недоступен в этом режиме.
        </div>
      )}

      {isVaultAvailable() && items.length === 0 && (
        <div className={styles.empty}>
          {loading ? 'Читаю архив…' : 'Пока пусто. Порисуйте — снимки появятся сами.'}
        </div>
      )}

      {items.length > 0 && (
        <div className={styles.grid}>
          {items.map((meta) => (
            <article key={meta.id} className={styles.card}>
              <VaultPreview meta={meta} />
              <div className={styles.info}>
                <span className={styles.name}>{meta.name || 'без имени'}</span>
                <span className={styles.meta}>
                  <span className={styles.kind}>
                    {meta.kind === 'texture' ? 'текстура' : `анимация · ${meta.frames}`}
                  </span>{' '}
                  {meta.width}×{meta.height}
                </span>
                <span className={styles.meta}>
                  {formatWhen(meta.createdAt)} · {meta.painted} пикс. · {formatBytes(meta.bytes)}
                </span>
                <div className={styles.actions}>
                  <Button size="sm" variant="primary" onClick={() => restore(meta)}>
                    Восстановить
                  </Button>
                  <Button size="sm" onClick={() => download(meta)}>
                    Скачать
                  </Button>
                  <Button size="sm" icon onClick={() => remove(meta)} title="Удалить снимок">
                    ✕
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </Modal>
  );
}
