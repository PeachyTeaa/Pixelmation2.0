import { useEffect, useRef, useState } from 'react';
import { renderCells, resolveSlide, type Slide, type Texture } from '~/core';
import { useEditorStore } from '~/state/store';
import { Button, Label, Panel, Row } from './kit';
import styles from './Editor.module.css';

/** Миниатюра кадра: рисуем один в один по пикселям, растягивает CSS. */
function FrameThumb({ slide, texture }: { slide: Slide; texture: Texture }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const image = renderCells(resolveSlide(slide, texture));
    if (image.width === 0 || image.height === 0) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  }, [slide, texture]);

  return <canvas ref={ref} className={styles.frameCanvas} />;
}

export function SlidesTimeline() {
  const slides = useEditorStore((state) => state.slides);
  const texture = useEditorStore((state) => state.texture);
  const currentSlide = useEditorStore((state) => state.currentSlide);
  const gotoSlide = useEditorStore((state) => state.gotoSlide);
  const addSlide = useEditorStore((state) => state.addSlide);
  const duplicateSlide = useEditorStore((state) => state.duplicateSlide);
  const deleteSlide = useEditorStore((state) => state.deleteSlide);
  const moveSlide = useEditorStore((state) => state.moveSlide);
  const insertTextureSlide = useEditorStore((state) => state.insertTextureSlide);
  const copySlide = useEditorStore((state) => state.copySlide);
  const pasteSlide = useEditorStore((state) => state.pasteSlide);
  const hasClipboard = useEditorStore((state) => state.slideClipboard !== null);
  const isPlaying = useEditorStore((state) => state.isPlaying);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const speed = useEditorStore((state) => state.speed);
  const setSpeed = useEditorStore((state) => state.setSpeed);

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  return (
    <Panel
      title={`Кадры · ${currentSlide + 1} из ${slides.length}`}
      className={styles.timeline}
      actions={
        <Row>
          <Button size="sm" onClick={() => setPlaying(!isPlaying)} title="Пробел">
            {isPlaying ? '■ Стоп' : '▶ Пуск'}
          </Button>
        </Row>
      }
    >
      <div className={styles.track}>
        {slides.map((slide, index) => (
          <div
            key={index}
            className={`${styles.frame} ${index === currentSlide ? styles.frameActive : ''} ${
              dragOver === index ? styles.frameDragOver : ''
            }`}
            draggable
            onClick={() => gotoSlide(index)}
            onDragStart={() => setDragFrom(index)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(index);
            }}
            onDragLeave={() => setDragOver((current) => (current === index ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              if (dragFrom !== null && dragFrom !== index) moveSlide(dragFrom, index);
              setDragFrom(null);
              setDragOver(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
            title={`Кадр ${index + 1} — перетащите, чтобы поменять местами`}
          >
            <FrameThumb slide={slide} texture={texture} />
            <span className={styles.frameIndex}>{index + 1}</span>
          </div>
        ))}
      </div>

      <div className={styles.slideControls}>
        <Button size="sm" onClick={addSlide}>
          + Пустой кадр
        </Button>
        <Button size="sm" onClick={duplicateSlide}>
          Копия кадра
        </Button>
        <Button size="sm" onClick={insertTextureSlide}>
          Текстуру в кадр
        </Button>
        <Button size="sm" onClick={copySlide}>
          Копировать
        </Button>
        <Button size="sm" disabled={!hasClipboard} onClick={() => pasteSlide()}>
          Вставить
        </Button>
        <Button size="sm" variant="danger" onClick={deleteSlide}>
          Удалить кадр
        </Button>

        <div className={styles.grow} style={{ minWidth: 180 }}>
          <Label>Скорость · {speed} мс</Label>
          <input
            className={styles.slider}
            type="range"
            min={20}
            max={1000}
            step={10}
            value={speed}
            onChange={(event) => setSpeed(+event.target.value)}
          />
        </div>
      </div>
    </Panel>
  );
}
