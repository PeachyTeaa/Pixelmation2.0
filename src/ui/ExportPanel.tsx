import { useState } from 'react';
import { useEditorStore } from '~/state/store';
import { exportAnimationGif, exportSlidePng, exportTexturePng } from '~/services/exportImage';
import { currentAnimation, currentTexture, saveCurrentDocument } from '~/services/save';
import { saveTexture } from '~/services/files';
import { toast, toastError } from '~/services/toast';
import { Button, Field, Label, Panel, Row, Switch } from './kit';
import styles from './Editor.module.css';

const SCALES = [1, 4, 8, 16];

export function ExportPanel() {
  const mode = useEditorStore((state) => state.mode);
  const animationTab = useEditorStore((state) => state.animationTab);
  const currentSlide = useEditorStore((state) => state.currentSlide);
  const canvasBg = useEditorStore((state) => state.canvasBg);
  const speed = useEditorStore((state) => state.speed);
  const [scale, setScale] = useState(8);
  const [withBackground, setWithBackground] = useState(false);

  const background = withBackground ? canvasBg : null;

  const run = async (action: () => Promise<string> | string) => {
    try {
      toast(`Готово: ${await action()}`);
    } catch (error) {
      toastError(error);
    }
  };

  return (
    <Panel title="Экспорт">
      <Button variant="primary" block onClick={() => saveCurrentDocument()}>
        Сохранить {mode === 'texture' ? '.pxlmt' : '.pxlma'} · Ctrl+S
      </Button>

      <Switch checked={withBackground} onChange={setWithBackground}>
        Подложить фон холста
      </Switch>

      <Field label="Масштаб картинки">
        <Row>
          {SCALES.map((value) => (
            <Button key={value} size="sm" active={scale === value} onClick={() => setScale(value)}>
              ×{value}
            </Button>
          ))}
        </Row>
      </Field>

      {mode === 'texture' ? (
        <Button block onClick={() => run(() => exportTexturePng(currentTexture(), { scale, background }))}>
          PNG текстуры
        </Button>
      ) : (
        <>
          {animationTab === 'texture' && (
            <Button block onClick={() => run(() => saveTexture(currentTexture()))}>
              Текстура .pxlmt
            </Button>
          )}
          <Button
            block
            onClick={() => run(() => exportSlidePng(currentAnimation(), currentSlide, { scale, background }))}
          >
            PNG текущего кадра
          </Button>
          <Button
            block
            onClick={() =>
              run(() => exportAnimationGif(currentAnimation(), { scale, delayMs: speed, background }))
            }
          >
            GIF анимации · {speed} мс
          </Button>
        </>
      )}

      <Label>
        <span className={styles.refInfo}>Ctrl+Z — отмена, Ctrl+Shift+Z — повтор</span>
      </Label>
    </Panel>
  );
}
