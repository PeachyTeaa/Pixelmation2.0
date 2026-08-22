import { resolveRef } from '~/core';
import { isTextureSurface, useEditorStore } from '~/state/store';
import { Button } from './kit';
import styles from './Header.module.css';

interface HeaderProps {
  onSave: () => void;
  onSaveAs: () => void;
  onVault: () => void;
  onOpen: () => void;
  onHelp: () => void;
  onHome: () => void;
}

export function Header({ onSave, onSaveAs, onOpen, onHelp, onHome, onVault }: HeaderProps) {
  const mode = useEditorStore((state) => state.mode);
  const name = useEditorStore((state) => state.documentName);
  const dirty = useEditorStore((state) => state.dirty);
  const theme = useEditorStore((state) => state.theme);
  const setName = useEditorStore((state) => state.setName);
  const setTheme = useEditorStore((state) => state.setTheme);
  const saveTarget = useEditorStore((state) => state.saveTarget);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <button className={styles.brand} onClick={onHome} title="На главную">
          <span className={styles.brandName}>
            Pixel<span className={styles.brandAccent}>mation</span>
          </span>
        </button>

        {mode && (
          <>
            <span className={styles.chip}>{mode === 'texture' ? 'текстура' : 'анимация'}</span>
            <input
              className={styles.name}
              value={name}
              placeholder="без имени"
              onChange={(event) => setName(event.target.value)}
              aria-label="Имя документа"
            />
            <span
              className={`${styles.dot} ${dirty ? '' : styles.saved}`}
              title={dirty ? 'Есть несохранённые изменения' : 'Всё сохранено'}
            />
            <CurrentColor />
          </>
        )}

        <div className={styles.actions}>
          <Button size="sm" onClick={onOpen} title="Открыть файл (.pxlmt / .pxlma)">
            Открыть
          </Button>
          {mode && (
            <>
              <Button
                size="sm"
                variant="primary"
                onClick={onSave}
                title={saveTarget ? `Перезаписать ${saveTarget} · Ctrl+S` : 'Выбрать файл · Ctrl+S'}
              >
                Сохранить
              </Button>
              <Button size="sm" onClick={onSaveAs} title="Сохранить копией в новый файл · Ctrl+Shift+S">
                Сохранить как…
              </Button>
            </>
          )}
          <Button size="sm" icon onClick={onVault} title="Восстановление: архив последних работ">
            ⟲
          </Button>
          <Button
            size="sm"
            icon
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="Сменить тему"
          >
            {theme === 'dark' ? '☾' : '☀'}
          </Button>
          <Button size="sm" icon onClick={onHelp} title="Справка и горячие клавиши (?)">
            ?
          </Button>
        </div>
      </div>
    </header>
  );
}

/** Чем сейчас рисуем: цвет текстуры или пиксель текстуры, выбранный для кадра. */
function CurrentColor() {
  const color = useEditorStore((state) =>
    isTextureSurface(state) ? state.color : resolveRef(state.texture, state.currentRef),
  );
  const ref = useEditorStore((state) => (isTextureSurface(state) ? null : state.currentRef));
  const label = color === null ? 'прозрачный' : color;

  return (
    <span
      className={styles.current}
      title={ref ? `Пиксель текстуры x=${ref.x}, y=${ref.y} — ${label}` : `Текущий цвет: ${label}`}
    >
      <span className={styles.currentSwatch}>
        {color && <span className={styles.currentFill} style={{ background: color }} />}
      </span>
      <span className={styles.currentText}>
        {label}
        {ref && ` · ${ref.x}:${ref.y}`}
      </span>
    </span>
  );
}
