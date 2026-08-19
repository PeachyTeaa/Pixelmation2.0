import { resolveRef } from '~/core';
import { useEditorStore } from '~/state/store';
import { Button, Label, Panel, Row } from './kit';
import { PixelCanvas } from './PixelCanvas';
import styles from './Editor.module.css';

/**
 * Панель режима анимации: превью привязанной текстуры и выбранная ссылка.
 * Клик по превью (любой кнопкой) выбирает пиксель, которым будем рисовать.
 */
export function RefPanel() {
  const texture = useEditorStore((state) => state.texture);
  const currentRef = useEditorStore((state) => state.currentRef);
  const setRef = useEditorStore((state) => state.setRef);
  const showGrid = useEditorStore((state) => state.showGrid);
  const setAnimationTab = useEditorStore((state) => state.setAnimationTab);

  const color = resolveRef(texture, currentRef);

  return (
    <Panel
      title="Текстура анимации"
      actions={
        <Button size="sm" onClick={() => setAnimationTab('texture')}>
          Править
        </Button>
      }
    >
      <div className={styles.preview}>
        <PixelCanvas
          cells={texture.cells}
          showGrid={showGrid}
          maxCellSize={12}
          onCellDown={(point) => {
            const cell = texture.cells[point.y]?.[point.x] ?? null;
            setRef(cell === null ? null : point);
          }}
        />
      </div>

      <div>
        <Label>Текущая ссылка</Label>
        <div className={styles.refRow}>
          <span className={styles.swatch} title={color ?? 'прозрачно'}>
            {color && <span className={styles.swatchFill} style={{ background: color }} />}
          </span>
          <span className={styles.refInfo}>
            {currentRef ? (
              <>
                x={currentRef.x}, y={currentRef.y}
                <br />
                {color ?? '—'}
              </>
            ) : (
              'прозрачность (E)'
            )}
          </span>
        </div>
      </div>

      <Row>
        <Button size="sm" active={currentRef === null} onClick={() => setRef(null)} title="Клавиша E">
          Прозрачная · E
        </Button>
      </Row>
    </Panel>
  );
}
