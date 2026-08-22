import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  currentTarget,
  forgetTarget,
  isOverwriteSupported,
  openProjectFile,
  pickTarget,
  rememberTarget,
  writeTarget,
} from './fileTarget';

/**
 * Поддельный дескриптор файла. Методы живут в прототипе, а не в полях: иначе
 * объект не пережил бы structured clone по дороге в IndexedDB — как и настоящий
 * дескриптор, который браузер сериализует сам.
 */
class FakeHandle {
  readonly kind = 'file';
  written: string | null = null;
  asked = 0;

  constructor(
    readonly name: string,
    readonly permission: 'granted' | 'prompt' | 'denied' = 'granted',
  ) {}

  async queryPermission() {
    return this.permission;
  }

  async requestPermission() {
    this.asked++;
    return this.permission === 'prompt' ? 'granted' : this.permission;
  }

  async createWritable() {
    return {
      write: async (text: string) => {
        this.written = text;
      },
      close: async () => {},
    };
  }
}

/** Подделка под видом дескриптора — и она же для проверок. */
function fakeHandle(name: string, permission: 'granted' | 'prompt' | 'denied' = 'granted') {
  const state = new FakeHandle(name, permission);
  return { handle: state as unknown as FileSystemFileHandle, state };
}

beforeEach(async () => {
  vi.stubGlobal('showSaveFilePicker', undefined);
  await forgetTarget();
});

afterEach(() => vi.unstubAllGlobals());

describe('поддержка перезаписи', () => {
  it('без showSaveFilePicker считает браузер неумеющим', () => {
    expect(isOverwriteSupported()).toBe(false);
  });

  it('с showSaveFilePicker — умеющим', () => {
    vi.stubGlobal('showSaveFilePicker', async () => fakeHandle('a.pxlmt').handle);
    expect(isOverwriteSupported()).toBe(true);
  });
});

describe('запись в цель', () => {
  it('пишет текст в запомненный файл', async () => {
    const { handle, state } = fakeHandle('лиса.pxlmt');
    await rememberTarget(handle);

    expect(await writeTarget('{"привет":1}')).toBe(true);
    expect(state.written).toBe('{"привет":1}');
  });

  it('без цели ничего не пишет', async () => {
    expect(await writeTarget('{}')).toBe(false);
  });

  it('спрашивает разрешение, если его ещё не давали', async () => {
    const { handle, state } = fakeHandle('лиса.pxlmt', 'prompt');
    await rememberTarget(handle);

    expect(await writeTarget('{}')).toBe(true);
    expect(state.asked).toBe(1);
    expect(state.written).toBe('{}');
  });

  it('при отказе в разрешении не пишет и забывает цель', async () => {
    const { handle, state } = fakeHandle('лиса.pxlmt', 'denied');
    await rememberTarget(handle);

    expect(await writeTarget('{}')).toBe(false);
    expect(state.written).toBeNull();
    expect(currentTarget()).toBeNull();
  });
});

describe('память о цели', () => {
  it('запомненная цель доступна по имени', async () => {
    const { handle } = fakeHandle('лиса.pxlmt');
    await rememberTarget(handle);
    expect(currentTarget()?.name).toBe('лиса.pxlmt');
  });

  it('переживает перезагрузку вкладки', async () => {
    const { handle } = fakeHandle('лиса.pxlmt');
    await rememberTarget(handle);

    const reloaded = await freshModule();
    expect(reloaded.currentTarget()).toBeNull();

    expect(await reloaded.restoreTarget()).toBe('лиса.pxlmt');
    expect(reloaded.currentTarget()?.name).toBe('лиса.pxlmt');
  });

  it('после забывания не восстанавливается', async () => {
    await rememberTarget(fakeHandle('лиса.pxlmt').handle);
    await forgetTarget();

    const reloaded = await freshModule();
    expect(await reloaded.restoreTarget()).toBeNull();
  });
});

describe('выбор нового файла', () => {
  it('отдаёт дескриптор из системного диалога', async () => {
    const { handle } = fakeHandle('новая.pxlmt');
    const picker = vi.fn(async () => handle);
    vi.stubGlobal('showSaveFilePicker', picker);

    expect(await pickTarget('лиса.pxlmt')).toBe(handle);
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'лиса.pxlmt' }));
  });

  it('отмену диалога отдаёт как отсутствие файла, а не как ошибку', async () => {
    vi.stubGlobal('showSaveFilePicker', async () => {
      throw new DOMException('The user aborted a request.', 'AbortError');
    });

    expect(await pickTarget('лиса.pxlmt')).toBeNull();
  });

  it('настоящую ошибку диалога пробрасывает', async () => {
    vi.stubGlobal('showSaveFilePicker', async () => {
      throw new Error('диск отвалился');
    });

    await expect(pickTarget('лиса.pxlmt')).rejects.toThrow('диск отвалился');
  });
});

/** Имитирует перезагрузку вкладки: модуль поднимается заново, IndexedDB цела. */
async function freshModule() {
  vi.resetModules();
  return import('./fileTarget');
}

describe('открытие файла', () => {
  it('отдаёт и содержимое, и дескриптор для будущей перезаписи', async () => {
    const { handle } = fakeHandle('лиса.pxlmt');
    const file = new File(['{}'], 'лиса.pxlmt');
    (handle as unknown as { getFile: () => Promise<File> }).getFile = async () => file;
    vi.stubGlobal('showOpenFilePicker', async () => [handle]);

    const picked = await openProjectFile();

    expect(picked?.file).toBe(file);
    expect(picked?.handle).toBe(handle);
  });

  it('отмену отдаёт как отсутствие файла', async () => {
    vi.stubGlobal('showOpenFilePicker', async () => {
      throw new DOMException('The user aborted a request.', 'AbortError');
    });

    expect(await openProjectFile()).toBeNull();
  });

  it('без поддержки API открывает через обычное поле выбора, без дескриптора', async () => {
    vi.stubGlobal('showOpenFilePicker', undefined);
    const file = new File(['{}'], 'лиса.pxlmt');
    // Поле выбора рисует настоящий <input>, поэтому подменяем модуль целиком.
    vi.resetModules();
    vi.doMock('./files', () => ({ pickFile: async () => file }));
    try {
      const fresh = await import('./fileTarget');
      expect(await fresh.openProjectFile()).toEqual({ file, handle: null });
    } finally {
      vi.doUnmock('./files');
      vi.resetModules();
    }
  });
});
