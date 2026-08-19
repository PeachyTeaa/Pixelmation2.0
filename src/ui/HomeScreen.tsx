import { useState } from 'react';
import { MAX_CANVAS_SIZE, MIN_CANVAS_SIZE, SIZE_PRESETS, clampCanvasSize } from '~/core';
import { DEFAULT_SIZE, useEditorStore } from '~/state/store';
import { Button, Field, Input, Label } from './kit';
import styles from './HomeScreen.module.css';

interface HomeScreenProps {
  onOpen: () => void;
}

export function HomeScreen({ onOpen }: HomeScreenProps) {
  const newDocument = useEditorStore((state) => state.newDocument);
  const [mode, setMode] = useState<'texture' | 'animation'>('texture');
  const [width, setWidth] = useState(DEFAULT_SIZE);
  const [height, setHeight] = useState(DEFAULT_SIZE);
  const [name, setName] = useState('');

  const applyPreset = (size: number) => {
    setWidth(size);
    setHeight(size);
  };

  return (
    <div className={styles.screen}>
      <div className={`${styles.blob} ${styles.blobBlue}`} />
      <div className={`${styles.blob} ${styles.blobCyan}`} />

      <div className={styles.card}>
        <div>
          <h1>Создать новый документ</h1>
          <p className={styles.lead}>
            Пиксельные текстуры и покадровые анимации в форматах .pxlmt и .pxlma. Файлы из первой
            версии Pixelmation открываются как есть — просто перетащите их в окно.
          </p>
        </div>

        <div className={styles.modes}>
          <button
            className={`${styles.mode} ${mode === 'texture' ? styles.modeActive : ''}`}
            onClick={() => setMode('texture')}
          >
            <span className={styles.modeName}>Текстура</span>
            <span className={styles.modeHint}>
              Холст из пикселей: рисуем цветом, пипетка, заливка, сдвиг. Экспорт .pxlmt и .png
            </span>
          </button>
          <button
            className={`${styles.mode} ${mode === 'animation' ? styles.modeActive : ''}`}
            onClick={() => setMode('animation')}
          >
            <span className={styles.modeName}>Анимация</span>
            <span className={styles.modeHint}>
              Кадры ссылаются на пиксели своей текстуры. Экспорт .pxlma, .png и .gif
            </span>
          </button>
        </div>

        <div className={styles.sizes}>
          <Field label="Ширина">
            <Input
              type="number"
              min={MIN_CANVAS_SIZE}
              max={MAX_CANVAS_SIZE}
              value={width}
              onChange={(event) => setWidth(clampCanvasSize(+event.target.value))}
            />
          </Field>
          <Field label="Высота">
            <Input
              type="number"
              min={MIN_CANVAS_SIZE}
              max={MAX_CANVAS_SIZE}
              value={height}
              onChange={(event) => setHeight(clampCanvasSize(+event.target.value))}
            />
          </Field>
          <Field label="Имя">
            <Input
              value={name}
              placeholder={mode === 'texture' ? 'texture' : 'animation'}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
        </div>

        <div>
          <Label>Готовые размеры</Label>
          <div className={styles.presets}>
            {SIZE_PRESETS.map((size) => (
              <Button
                key={size}
                size="sm"
                active={width === size && height === size}
                onClick={() => applyPreset(size)}
              >
                {size}×{size}
              </Button>
            ))}
          </div>
        </div>

        <div className={styles.footer}>
          <span className={styles.drop}>Перетащите .pxlmt или .pxlma в окно</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button onClick={onOpen}>Открыть файл</Button>
            <Button variant="primary" onClick={() => newDocument(mode, width, height, name.trim())}>
              Создать {width}×{height}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
