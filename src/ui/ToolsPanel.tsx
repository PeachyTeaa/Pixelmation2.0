import { useEffect, useState } from 'react';
import { MAX_CANVAS_SIZE, MIN_CANVAS_SIZE, clampCanvasSize, textureSize } from '~/core';
import { useEditorStore } from '~/state/store';
import type { Tool } from '~/state/types';
import { Button, Field, Input, Label, Panel, Switch } from './kit';
import styles from './Editor.module.css';

const TOOLS: Array<{ id: Tool; name: string; hotkey: string }> = [
  { id: 'pen', name: 'Кисть', hotkey: 'B' },
  { id: 'eraser', name: 'Ластик', hotkey: 'X' },
  { id: 'fill', name: 'Заливка', hotkey: 'G' },
  { id: 'line', name: 'Линия', hotkey: 'L' },
  { id: 'rect', name: 'Прямоуг.', hotkey: 'R' },
  { id: 'ellipse', name: 'Эллипс', hotkey: 'O' },
  { id: 'picker', name: 'Пипетка', hotkey: 'I' },
  { id: 'move', name: 'Двигать', hotkey: 'F' },
];

export function ToolsPanel() {
  const tool = useEditorStore((state) => state.tool);
  const setTool = useEditorStore((state) => state.setTool);
  const showGrid = useEditorStore((state) => state.showGrid);
  const setShowGrid = useEditorStore((state) => state.setShowGrid);
  const fillShape = useEditorStore((state) => state.fillShape);
  const setFillShape = useEditorStore((state) => state.setFillShape);
  const wrapShift = useEditorStore((state) => state.wrapShift);
  const setWrapShift = useEditorStore((state) => state.setWrapShift);
  const shiftBy = useEditorStore((state) => state.shiftBy);
  const clearCanvas = useEditorStore((state) => state.clearCanvas);

  return (
    <Panel title="Инструменты">
      <div className={styles.tools}>
        {TOOLS.map((item) => (
          <Button
            key={item.id}
            className={styles.toolButton}
            active={tool === item.id}
            onClick={() => setTool(item.id)}
            title={`${item.name} (${item.hotkey})`}
          >
            <span>{item.name}</span>
            <span className={styles.toolKey}>{item.hotkey}</span>
          </Button>
        ))}
      </div>

      <Switch checked={showGrid} onChange={setShowGrid}>
        Сетка · Shift+G
      </Switch>
      <Switch checked={fillShape} onChange={setFillShape}>
        Заливать фигуры
      </Switch>
      <Switch checked={wrapShift} onChange={setWrapShift}>
        Сдвиг по кругу
      </Switch>

      <div>
        <Label>Сдвинуть рисунок</Label>
        <div className={styles.pad}>
          <span className={styles.padSpacer} />
          <Button size="sm" onClick={() => shiftBy(0, -1)} title="Вверх">
            ↑
          </Button>
          <span className={styles.padSpacer} />
          <Button size="sm" onClick={() => shiftBy(-1, 0)} title="Влево">
            ←
          </Button>
          <Button size="sm" onClick={() => shiftBy(0, 1)} title="Вниз">
            ↓
          </Button>
          <Button size="sm" onClick={() => shiftBy(1, 0)} title="Вправо">
            →
          </Button>
        </div>
      </div>

      <ResizeForm />

      <Button
        variant="danger"
        block
        onClick={() => {
          if (confirm('Очистить холст? Действие можно отменить через Ctrl+Z.')) clearCanvas();
        }}
      >
        Очистить холст
      </Button>
    </Panel>
  );
}

function ResizeForm() {
  const texture = useEditorStore((state) => state.texture);
  const resizeDocument = useEditorStore((state) => state.resizeDocument);
  const size = textureSize(texture);
  const [width, setWidth] = useState(size.width);
  const [height, setHeight] = useState(size.height);

  useEffect(() => {
    setWidth(size.width);
    setHeight(size.height);
  }, [size.width, size.height]);

  const changed = width !== size.width || height !== size.height;

  return (
    <div>
      <Label>Размер холста</Label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.4rem', alignItems: 'end' }}>
        <Field label="Ш">
          <Input
            type="number"
            min={MIN_CANVAS_SIZE}
            max={MAX_CANVAS_SIZE}
            value={width}
            onChange={(event) => setWidth(clampCanvasSize(+event.target.value))}
          />
        </Field>
        <Field label="В">
          <Input
            type="number"
            min={MIN_CANVAS_SIZE}
            max={MAX_CANVAS_SIZE}
            value={height}
            onChange={(event) => setHeight(clampCanvasSize(+event.target.value))}
          />
        </Field>
        <Button size="sm" disabled={!changed} onClick={() => resizeDocument(width, height)}>
          Ок
        </Button>
      </div>
    </div>
  );
}
