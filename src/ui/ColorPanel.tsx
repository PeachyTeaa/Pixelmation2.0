import { alphaOf, texturePalette, toRgbHex, withAlpha } from '~/core';
import { useEditorStore } from '~/state/store';
import { Button, Label, Panel, Row } from './kit';
import styles from './Editor.module.css';

/** Выбор цвета с альфа-каналом, палитра холста и фоны. */
export function ColorPanel() {
  const color = useEditorStore((state) => state.color);
  const setColor = useEditorStore((state) => state.setColor);
  const setTransparentColor = useEditorStore((state) => state.setTransparentColor);
  const lastColor = useEditorStore((state) => state.lastColor);
  const texture = useEditorStore((state) => state.texture);

  const alpha = alphaOf(color ?? lastColor);
  const rgb = toRgbHex(color ?? lastColor);
  const palette = texturePalette(texture).slice(0, 32);

  return (
    <Panel title="Цвет">
      <div className={styles.swatchRow}>
        <span className={styles.swatch} title={color ?? 'прозрачный'}>
          {color && <span className={styles.swatchFill} style={{ background: color }} />}
        </span>
        <input
          className={styles.colorInput}
          type="color"
          value={rgb}
          onChange={(event) => setColor(withAlpha(`${event.target.value}ff`, alpha || 255))}
          aria-label="Цвет"
        />
        <div style={{ flex: 1 }}>
          <Label>Альфа · {alpha}</Label>
          <input
            className={styles.slider}
            type="range"
            min={0}
            max={255}
            value={alpha}
            onChange={(event) => setColor(withAlpha(color ?? lastColor, +event.target.value))}
          />
        </div>
      </div>

      <Row>
        <Button size="sm" active={color === null} onClick={setTransparentColor} title="Клавиша E">
          Прозрачный · E
        </Button>
        {color === null && (
          <Button size="sm" onClick={() => setColor(lastColor)}>
            Вернуть {lastColor}
          </Button>
        )}
      </Row>

      <div>
        <Label>Палитра холста</Label>
        <div className={styles.palette}>
          {palette.length === 0 && <span className={styles.refInfo}>холст пуст</span>}
          {palette.map(({ color: swatch, count }) => (
            <button
              key={swatch}
              className={styles.paletteItem}
              style={{ background: swatch }}
              title={`${swatch} — ${count} пикс.`}
              onClick={() => setColor(swatch)}
            />
          ))}
        </div>
      </div>

      <BackgroundControls />
    </Panel>
  );
}

/** Фон холста и фон приложения. */
export function BackgroundControls() {
  const canvasBg = useEditorStore((state) => state.canvasBg);
  const setCanvasBg = useEditorStore((state) => state.setCanvasBg);
  const appBg = useEditorStore((state) => state.appBg);
  const setAppBg = useEditorStore((state) => state.setAppBg);

  return (
    <>
      <div>
        <Label>Фон холста</Label>
        <Row>
          <input
            className={styles.colorInput}
            type="color"
            value={toRgbHex(canvasBg ?? '#777777ff')}
            onChange={(event) => setCanvasBg(`${event.target.value}ff`)}
            aria-label="Фон холста"
          />
          <Button size="sm" active={canvasBg === null} onClick={() => setCanvasBg(null)}>
            Шахматка
          </Button>
        </Row>
      </div>

      <div>
        <Label>Фон приложения</Label>
        <Row>
          <input
            className={styles.colorInput}
            type="color"
            value={appBg || '#0b0e14'}
            onChange={(event) => setAppBg(event.target.value)}
            aria-label="Фон приложения"
          />
          <Button size="sm" onClick={() => setAppBg('')}>
            По теме
          </Button>
        </Row>
      </div>
    </>
  );
}
