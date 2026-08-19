import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gridSize, type Cell, type Point, type TextureCells } from '~/core';
import styles from './PixelCanvas.module.css';

/** Кнопка мыши, приведённая к смыслу редактора. */
export type CanvasButton = 'left' | 'right';

export interface PixelCanvasProps {
  cells: TextureCells;
  showGrid?: boolean;
  /** Подложка холста: `null` — шахматка прозрачности. */
  background?: Cell;
  /** Пикселей экрана на клетку. `null` — вписать в контейнер. */
  zoom?: number | null;
  /** Клетки, подсвеченные как предпросмотр фигуры. */
  preview?: Point[];
  previewColor?: Cell;
  /** Максимальный размер клетки при автоподгонке. */
  maxCellSize?: number;
  className?: string;
  cursor?: 'draw' | 'move' | 'picker';
  onCellDown?: (point: Point, button: CanvasButton) => void;
  onCellMove?: (point: Point, buttons: number) => void;
  onCellUp?: (point: Point | null) => void;
  onCellHover?: (point: Point | null) => void;
}

const LIGHT_GRID = 'rgba(15, 19, 27, 0.16)';
const DARK_GRID = 'rgba(255, 255, 255, 0.12)';

function isLightTheme(): boolean {
  return document.documentElement.classList.contains('theme-light');
}

/**
 * Холст пиксельного редактора: рисует сетку клеток на canvas и переводит
 * события мыши в координаты клеток. Ничего не знает про инструменты и store.
 */
export function PixelCanvas({
  cells,
  showGrid = true,
  background = null,
  zoom = null,
  preview,
  previewColor,
  maxCellSize = 40,
  className,
  cursor = 'draw',
  onCellDown,
  onCellMove,
  onCellUp,
  onCellHover,
}: PixelCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  const { width: cols, height: rows } = gridSize(cells);

  useLayoutEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      setAvailable({ width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fitted =
    cols > 0 && rows > 0 && available.width > 0
      ? Math.max(
          1,
          Math.min(
            maxCellSize,
            Math.floor(Math.min((available.width - 16) / cols, (available.height - 16) / rows)),
          ),
        )
      : 1;
  const cellSize = zoom ?? fitted;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cols === 0 || rows === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const width = cols * cellSize;
    const height = rows * cellSize;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    // подложка: сплошной цвет или шахматка прозрачности
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    } else {
      const step = Math.max(4, Math.round(cellSize / 2));
      const light = isLightTheme();
      context.fillStyle = light ? 'rgba(15,19,27,0.05)' : 'rgba(255,255,255,0.05)';
      context.fillRect(0, 0, width, height);
      context.fillStyle = light ? 'rgba(15,19,27,0.09)' : 'rgba(255,255,255,0.045)';
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          if (((x / step) | 0) % 2 === ((y / step) | 0) % 2) continue;
          context.fillRect(x, y, Math.min(step, width - x), Math.min(step, height - y));
        }
      }
    }

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = cells[y][x];
        if (!cell) continue;
        context.fillStyle = cell;
        context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }

    if (preview && preview.length > 0) {
      context.fillStyle = previewColor ?? 'rgba(109, 139, 255, 0.75)';
      context.globalAlpha = previewColor ? 0.75 : 1;
      for (const point of preview) {
        if (point.x < 0 || point.y < 0 || point.x >= cols || point.y >= rows) continue;
        context.fillRect(point.x * cellSize, point.y * cellSize, cellSize, cellSize);
      }
      context.globalAlpha = 1;
    }

    if (showGrid && cellSize >= 5) {
      context.strokeStyle = isLightTheme() ? LIGHT_GRID : DARK_GRID;
      context.lineWidth = 1;
      context.beginPath();
      for (let x = 1; x < cols; x++) {
        context.moveTo(x * cellSize + 0.5, 0);
        context.lineTo(x * cellSize + 0.5, height);
      }
      for (let y = 1; y < rows; y++) {
        context.moveTo(0, y * cellSize + 0.5);
        context.lineTo(width, y * cellSize + 0.5);
      }
      context.stroke();
    }
  }, [cells, cols, rows, cellSize, showGrid, background, preview, previewColor]);

  const pointAt = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const box = canvas.getBoundingClientRect();
      const x = Math.floor((event.clientX - box.left) / cellSize);
      const y = Math.floor((event.clientY - box.top) / cellSize);
      if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
      return { x, y };
    },
    [cellSize, cols, rows],
  );

  return (
    <div ref={wrapRef} className={`${styles.wrap} ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${cursor === 'move' ? styles.move : ''} ${
          cursor === 'picker' ? styles.picker : ''
        }`}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          const point = pointAt(event);
          if (!point) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          onCellDown?.(point, event.button === 2 ? 'right' : 'left');
        }}
        onPointerMove={(event) => {
          const point = pointAt(event);
          onCellHover?.(point);
          if (point) onCellMove?.(point, event.buttons);
        }}
        onPointerUp={(event) => {
          onCellUp?.(pointAt(event));
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerLeave={() => onCellHover?.(null)}
        onPointerCancel={() => onCellUp?.(null)}
      />
      <span className={styles.badge}>
        {cols}×{rows} · {cellSize}px
      </span>
    </div>
  );
}
