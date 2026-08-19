import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '~/state/store';
import { clearSnapshots, listSnapshots } from './vault';
import { saveCurrentToVault, startVaultWatcher } from './vaultWatcher';

/** Даём асинхронным записям в IndexedDB завершиться. */
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

let stop: () => void = () => undefined;

beforeEach(async () => {
  localStorage.clear();
  await clearSnapshots();
  useEditorStore.getState().closeDocument();
});

afterEach(() => {
  stop();
  stop = () => undefined;
});

describe('наблюдатель архива', () => {
  it('сохраняет предыдущий документ, когда его заменяют новым', async () => {
    const store = () => useEditorStore.getState();
    store().newDocument('texture', 4, 4, 'первый');
    store().setColor('#ff0000ff');
    store().paint([{ x: 0, y: 0 }]);

    stop = startVaultWatcher({ idleMs: 5, maxMs: 10 });
    await settle();

    // Пользователь создаёт новый документ — старый должен уже лежать в архиве.
    store().newDocument('texture', 8, 8, 'второй');
    await settle();

    const list = await listSnapshots();
    expect(list.some((item) => item.name === 'первый' && item.painted === 1)).toBe(true);
  });

  it('пишет снимок после паузы в работе', async () => {
    const store = () => useEditorStore.getState();
    store().newDocument('texture', 4, 4, 'рисую');
    stop = startVaultWatcher({ idleMs: 5, maxMs: 10 });
    await settle();

    store().setColor('#00ff00ff');
    store().paint([{ x: 1, y: 1 }]);
    await settle(80);

    const list = await listSnapshots();
    expect(list[0]).toMatchObject({ name: 'рисую', painted: 1 });
  });

  it('не сохраняет пустой холст', async () => {
    const store = () => useEditorStore.getState();
    store().newDocument('texture', 4, 4, 'пусто');
    stop = startVaultWatcher({ idleMs: 5, maxMs: 10 });
    await settle(60);

    expect(await listSnapshots()).toHaveLength(0);
  });

  it('сохраняет текущую работу по запросу', async () => {
    const store = () => useEditorStore.getState();
    store().newDocument('animation', 4, 4, 'бег');
    store().setColor('#0000ffff');
    const ref = store().ensureColorRef('#0000ffff');
    store().setRef(ref);
    store().paint([{ x: 2, y: 2 }]);

    const meta = await saveCurrentToVault();
    expect(meta).toMatchObject({ kind: 'animation', name: 'бег', frames: 1 });
  });
});
