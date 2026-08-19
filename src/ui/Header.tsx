import { useEditorStore } from '~/state/store';
import { Button } from './kit';
import styles from './Header.module.css';

interface HeaderProps {
  onSave: () => void;
  onOpen: () => void;
  onHelp: () => void;
  onHome: () => void;
}

export function Header({ onSave, onOpen, onHelp, onHome }: HeaderProps) {
  const mode = useEditorStore((state) => state.mode);
  const name = useEditorStore((state) => state.documentName);
  const dirty = useEditorStore((state) => state.dirty);
  const theme = useEditorStore((state) => state.theme);
  const setName = useEditorStore((state) => state.setName);
  const setTheme = useEditorStore((state) => state.setTheme);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <button className={styles.brand} onClick={onHome} title="На главную">
          <span className={styles.brandName}>
            Pixel<span className={styles.brandAccent}>mation</span>
          </span>
          <span className={styles.chip}>2.0</span>
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
          </>
        )}

        <div className={styles.actions}>
          <Button size="sm" onClick={onOpen} title="Открыть файл (.pxlmt / .pxlma)">
            Открыть
          </Button>
          {mode && (
            <Button size="sm" variant="primary" onClick={onSave} title="Ctrl+S">
              Сохранить
            </Button>
          )}
          <Button size="sm" icon onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Сменить тему">
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
