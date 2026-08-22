import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useEditorStore } from '~/state/store';
import { readProjectFile } from '~/services/files';
import { openProjectFile, rememberTarget } from '~/services/fileTarget';
import { saveCurrentDocument, saveDocumentAs, startSaveTarget } from '~/services/save';
import { getToasts, subscribeToasts, toast, toastError } from '~/services/toast';
import { EditorScreen } from '~/ui/EditorScreen';
import { Header } from '~/ui/Header';
import { HelpModal } from '~/ui/HelpModal';
import { HomeScreen } from '~/ui/HomeScreen';
import { VaultModal } from '~/ui/VaultModal';
import { Toasts } from '~/ui/kit';
import { useFileDrop, useHotkeys, usePlayback, useThemeClass, useUnsavedWarning } from '~/ui/hooks';
import { startVaultWatcher } from '~/services/vaultWatcher';
import homeStyles from '~/ui/HomeScreen.module.css';

export default function App() {
  const mode = useEditorStore((state) => state.mode);
  const dirty = useEditorStore((state) => state.dirty);
  const appBg = useEditorStore((state) => state.appBg);
  const closeDocument = useEditorStore((state) => state.closeDocument);
  const [helpOpen, setHelpOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);

  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  const isDragging = useFileDrop();

  useThemeClass();
  // Архив восстановления пишется в фоне всё время, пока приложение открыто.
  useEffect(() => startVaultWatcher(), []);
  // Файл, в который пишет Ctrl+S: поднимаем из прошлого сеанса и следим за сменой документа.
  useEffect(() => startSaveTarget(), []);
  useUnsavedWarning();
  usePlayback();

  const handleSave = useCallback(() => void saveCurrentDocument(), []);
  const handleSaveAs = useCallback(() => void saveDocumentAs(), []);
  const handleHelp = useCallback(() => setHelpOpen((open) => !open), []);
  useHotkeys({ onSave: handleSave, onSaveAs: handleSaveAs, onToggleHelp: handleHelp });

  const handleOpen = useCallback(async () => {
    const picked = await openProjectFile();
    if (!picked) return;
    const { file, handle } = picked;
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
      // Открытый файл сразу становится целью: Ctrl+S будет писать прямо в него.
      if (handle) {
        await rememberTarget(handle);
        useEditorStore.getState().setSaveTarget(handle.name);
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
      <Header
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onOpen={handleOpen}
        onHelp={handleHelp}
        onHome={handleHome}
        onVault={() => setVaultOpen(true)}
      />
      {mode === null ? <HomeScreen onOpen={handleOpen} /> : <EditorScreen />}
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <VaultModal open={vaultOpen} onClose={() => setVaultOpen(false)} />
      <Toasts items={toasts} />
      {isDragging && (
        <div className={homeStyles.dropOverlay}>
          <div className={homeStyles.dropCard}>Отпустите файл .pxlmt или .pxlma</div>
        </div>
      )}
    </div>
  );
}
