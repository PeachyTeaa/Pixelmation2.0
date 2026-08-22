import { useCallback, useState } from 'react';
import { ANIMATION_EXT, TEXTURE_EXT, textureSize, type Texture } from '~/core';
import { useEditorStore } from '~/state/store';
import { pickFile, readProjectFile } from '~/services/files';
import { toast, toastError } from '~/services/toast';
import { Button, Modal, Row } from './kit';
import styles from './Editor.module.css';

/**
 * Кнопка «Загрузить текстуру»: подставляет в открытый документ текстуру из
 * другого файла. Если её размер не совпал с холстом — спрашивает, что подстроить.
 */
export function TextureFileButton() {
  const replaceTexture = useEditorStore((state) => state.replaceTexture);
  const texture = useEditorStore((state) => state.texture);
  const [pending, setPending] = useState<Texture | null>(null);

  const current = textureSize(texture);

  const apply = useCallback(
    (loaded: Texture, fit: boolean) => {
      replaceTexture(loaded, { fit });
      setPending(null);
      toast(`Текстура «${loaded.name || 'без имени'}» подставлена`);
    },
    [replaceTexture],
  );

  const handlePick = useCallback(async () => {
    const file = await pickFile(`${TEXTURE_EXT},${ANIMATION_EXT}`);
    if (!file) return;
    try {
      const result = await readProjectFile(file);
      // Из анимации берём привязанную к ней текстуру.
      const loaded =
        result.kind === 'texture'
          ? result.texture
          : {
              ...result.animation.texture,
              name: result.animation.texture.name || result.animation.name,
            };
      const size = textureSize(loaded);
      const canvas = textureSize(useEditorStore.getState().texture);
      if (size.width === canvas.width && size.height === canvas.height) {
        apply(loaded, false);
        return;
      }
      setPending(loaded);
    } catch (error) {
      toastError(error);
    }
  }, [apply]);

  const loadedSize = pending ? textureSize(pending) : null;

  return (
    <>
      <Button size="sm" onClick={handlePick} title="Подставить текстуру из файла .pxlmt или .pxlma">
        Загрузить текстуру…
      </Button>

      <Modal open={pending !== null} title="Размеры не совпадают" onClose={() => setPending(null)}>
        {pending && loadedSize && (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <p>
              Текстура «{pending.name || 'без имени'}» — {loadedSize.width}×{loadedSize.height},
              а холст — {current.width}×{current.height}. Что подстроить?
            </p>
            <Row>
              <Button variant="primary" onClick={() => apply(pending, false)}>
                Холст под текстуру
              </Button>
              <Button onClick={() => apply(pending, true)}>
                Текстуру под {current.width}×{current.height}
              </Button>
              <Button onClick={() => setPending(null)}>Отмена</Button>
            </Row>
            <p className={styles.refInfo}>
              В первом случае холст и кадры станут {loadedSize.width}×{loadedSize.height}, лишнее по
              краям кадров обрежется. Во втором целым останется рисунок анимации, а у текстуры
              обрежется всё за пределами {current.width}×{current.height}. Обе правки отменяются по
              Ctrl+Z.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
