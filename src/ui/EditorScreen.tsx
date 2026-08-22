import { useMemo } from 'react';
import { countPainted, countPaintedRefs, resolveSlide, texturePalette, textureSize } from '~/core';
import { isTextureSurface, useEditorStore } from '~/state/store';
import { Button, Panel, Row, Tile, Tiles } from './kit';
import { ColorPanel } from './ColorPanel';
import { ExportPanel } from './ExportPanel';
import { PixelCanvas } from './PixelCanvas';
import { RefPanel } from './RefPanel';
import { SlidesTimeline } from './SlidesTimeline';
import { TextureFileButton } from './TextureFileButton';
import { ToolsPanel } from './ToolsPanel';
import { usePainter } from './usePainter';
import styles from './Editor.module.css';

export function EditorScreen() {
  const mode = useEditorStore((state) => state.mode);
  const animationTab = useEditorStore((state) => state.animationTab);
  const setAnimationTab = useEditorStore((state) => state.setAnimationTab);
  const texture = useEditorStore((state) => state.texture);
  const slides = useEditorStore((state) => state.slides);
  const currentSlide = useEditorStore((state) => state.currentSlide);
  const showGrid = useEditorStore((state) => state.showGrid);
  const canvasBg = useEditorStore((state) => state.canvasBg);
  const zoom = useEditorStore((state) => state.zoom);
  const setZoom = useEditorStore((state) => state.setZoom);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const canUndo = useEditorStore((state) => state.past.length > 0);
  const canRedo = useEditorStore((state) => state.future.length > 0);

  const onTexture = isTextureSurface({ mode, animationTab });
  const painter = usePainter();

  const cells = useMemo(() => {
    if (onTexture) return texture.cells;
    const slide = slides[currentSlide];
    return slide ? resolveSlide(slide, texture) : texture.cells;
  }, [onTexture, texture, slides, currentSlide]);

  const size = textureSize(texture);
  const painted = onTexture
    ? countPainted(texture)
    : slides[currentSlide]
      ? countPaintedRefs(slides[currentSlide])
      : 0;
  const colors = texturePalette(texture).length;

  return (
    <div className={styles.layout}>
      <aside className={styles.side}>
        <ToolsPanel />
        {onTexture ? <ColorPanel /> : <RefPanel />}
        <ExportPanel />
      </aside>

      <main className={styles.main}>
        <Panel>
          <Row>
            {mode === 'animation' && (
              <div className={styles.tabs}>
                <Button
                  size="sm"
                  active={animationTab === 'slides'}
                  onClick={() => setAnimationTab('slides')}
                >
                  Кадры
                </Button>
                <Button
                  size="sm"
                  active={animationTab === 'texture'}
                  onClick={() => setAnimationTab('texture')}
                >
                  Текстура
                </Button>
              </div>
            )}

            {mode === 'animation' && animationTab === 'texture' && <TextureFileButton />}

            <span className={styles.grow} />

            <Button size="sm" disabled={!canUndo} onClick={undo} title="Ctrl+Z">
              ↶ Отменить
            </Button>
            <Button size="sm" disabled={!canRedo} onClick={redo} title="Ctrl+Shift+Z">
              ↷ Повторить
            </Button>
            <Button size="sm" onClick={() => setZoom(zoom ? Math.max(1, zoom - 2) : 8)}>
              −
            </Button>
            <Button size="sm" active={zoom === null} onClick={() => setZoom(null)}>
              Вписать
            </Button>
            <Button size="sm" onClick={() => setZoom(zoom ? Math.min(64, zoom + 2) : 12)}>
              +
            </Button>
          </Row>
        </Panel>

        <div className={styles.canvasArea}>
          <PixelCanvas
            cells={cells}
            showGrid={showGrid}
            background={canvasBg}
            zoom={zoom}
            preview={painter.preview}
            previewColor={painter.previewColor}
            cursor={painter.cursor}
            {...painter.handlers}
          />
        </div>

        {mode === 'animation' && animationTab === 'slides' && <SlidesTimeline />}

        <Tiles>
          <Tile label="Размер" value={`${size.width}×${size.height}`} hint="пикселей на холсте" />
          <Tile
            label={onTexture ? 'Закрашено' : 'Пикселей в кадре'}
            value={painted}
            hint={`из ${size.width * size.height}`}
          />
          <Tile label="Цветов" value={colors} hint="в палитре текстуры" />
          {mode === 'animation' && (
            <Tile label="Кадров" value={slides.length} hint={`текущий ${currentSlide + 1}`} />
          )}
        </Tiles>
      </main>
    </div>
  );
}
