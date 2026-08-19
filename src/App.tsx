import { useCallback, useState, useSyncExternalStore } from 'react';
import { useEditorStore } from '~/state/store';
import { pickFile, readProjectFile } from '~/services/files';
import { saveCurrentDocument } from '~/services/save';
import { getToasts, subscribeToasts, toast, toastError } from '~/services/toast';
import { EditorScreen } from '~/ui/EditorScreen';
import { Header } from '~/ui/Header';
import { HelpModal } from '~/ui/HelpModal';
import { HomeScreen } from '~/ui/HomeScreen';
import { Toasts } from '~/ui/kit';
import { useFileDrop, useHotkeys, usePlayback, useThemeClass, useUnsavedWarning } from '~/ui/hooks';
import homeStyles from '~/ui/HomeScreen.module.css';

export default function App() {
  const mode = useEditorStore((state) => state.mode);
  const dirty = useEditorStore((state) => state.dirty);
  const appBg = useEditorStore((state) => state.appBg);
  const closeDocument = useEditorStore((state) => state.closeDocument);
  const [helpOpen, setHelpOpen] = useState(false);

  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  const isDragging = useFileDrop();

  useThemeClass();
  useUnsavedWarning();
  usePlayback();

  const handleSave = useCallback(() => saveCurrentDocument(), []);
  const handleHelp = useCallback(() => setHelpOpen((open) => !open), []);
  useHotkeys({ onSave: handleSave, onToggleHelp: handleHelp });

  const handleOpen = useCallback(async () => {
    const file = await pickFile();
    if (!file) return;
    try {
      const result = await readProjectFile(file);
      const store = useEditorStore.getState();
      if (result.kind === 'texture') {
        store.loadTexture(result.texture);
        toast(`Текстура «${result.texture.name || file.name}» загружена`);
      } else {
        store.loadAnimation(result.animation);
        toast(`Анимация «${result.animation.name || file.name}» загружена`);
      }
    } catch (error) {
      toastError(error);
    }
  }, []);

  const handleHome = useCallback(() => {
    if (mode === null) return;
    if (dirty && !confirm('Прогресс не сохранён. Всё равно вернуться на главную?')) return;
    closeDocument();
  }, [mode, dirty, closeDocument]);

  return (
    <div style={appBg ? { background: appBg, minHeight: '100%' } : { minHeight: '100%' }}>
      <Header onSave={handleSave} onOpen={handleOpen} onHelp={handleHelp} onHome={handleHome} />
      {mode === null ? <HomeScreen onOpen={handleOpen} /> : <EditorScreen />}
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Toasts items={toasts} />
      {isDragging && (
        <div className={homeStyles.dropOverlay}>
          <div className={homeStyles.dropCard}>Отпустите файл .pxlmt или .pxlma</div>
        </div>
      )}
    </div>
  );
}
