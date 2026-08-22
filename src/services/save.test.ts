import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '~/state/store';
import { getToasts } from './toast';

const fileTarget = vi.hoisted(() => ({
  isOverwriteSupported: vi.fn(() => true),
  currentTarget: vi.fn<() => { name: string } | null>(() => null),
  rememberTarget: vi.fn(async () => {}),
  forgetTarget: vi.fn(async () => {}),
  restoreTarget: vi.fn(async (): Promise<string | null> => null),
  writeTarget: vi.fn(async (_text: string) => true),
  pickTarget: vi.fn(async (_name: string): Promise<{ name: string } | null> => null),
}));
vi.mock('./fileTarget', () => fileTarget);

const downloadProjectFile = vi.hoisted(() => vi.fn((file: { fileName: string }) => file.fileName));
vi.mock('./files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./files')>()),
  downloadProjectFile,
}));

const { saveCurrentDocument, saveDocumentAs, startSaveTarget } = await import('./save');

const store = () => useEditorStore.getState();
const lastToast = () => getToasts().at(-1)?.text ?? '';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  fileTarget.isOverwriteSupported.mockReturnValue(true);
  fileTarget.currentTarget.mockReturnValue(null);
  fileTarget.writeTarget.mockResolvedValue(true);
  fileTarget.pickTarget.mockResolvedValue(null);
  fileTarget.restoreTarget.mockResolvedValue(null);
  store().newDocument('texture', 4, 4, 'лиса');
  store().paint([{ x: 0, y: 0 }]);
});

describe('сохранение поверх файла', () => {
  it('с привязкой пишет в тот же файл и не создаёт копию', async () => {
    fileTarget.currentTarget.mockReturnValue({ name: 'лиса.pxlmt' });

    await saveCurrentDocument();

    expect(fileTarget.writeTarget).toHaveBeenCalledTimes(1);
    expect(downloadProjectFile).not.toHaveBeenCalled();
    expect(fileTarget.pickTarget).not.toHaveBeenCalled();
    expect(store().dirty).toBe(false);
    expect(lastToast()).toContain('лиса.pxlmt');
  });

  it('пишет именно содержимое документа', async () => {
    fileTarget.currentTarget.mockReturnValue({ name: 'лиса.pxlmt' });

    await saveCurrentDocument();

    const [text] = fileTarget.writeTarget.mock.calls[0];
    expect(JSON.parse(text)).toMatchObject({ name: 'лиса' });
  });

  it('без привязки спрашивает, куда сохранить, и запоминает выбор', async () => {
    fileTarget.pickTarget.mockResolvedValue({ name: 'новая.pxlmt' });

    await saveCurrentDocument();

    expect(fileTarget.pickTarget).toHaveBeenCalledWith('лиса.pxlmt');
    expect(fileTarget.rememberTarget).toHaveBeenCalledWith({ name: 'новая.pxlmt' });
    expect(store().saveTarget).toBe('новая.pxlmt');
    expect(store().dirty).toBe(false);
  });

  it('отмену диалога переживает молча и документ сохранённым не считает', async () => {
    fileTarget.pickTarget.mockResolvedValue(null);
    const before = getToasts().length;

    await saveCurrentDocument();

    expect(store().dirty).toBe(true);
    expect(store().saveTarget).toBeNull();
    // Ни «сохранено», ни ошибки: пользователь просто передумал.
    expect(getToasts()).toHaveLength(before);
  });

  it('при отказе в разрешении переспрашивает, куда сохранить', async () => {
    fileTarget.currentTarget.mockReturnValue({ name: 'лиса.pxlmt' });
    fileTarget.writeTarget.mockResolvedValue(false);
    fileTarget.pickTarget.mockResolvedValue({ name: 'другая.pxlmt' });

    await saveCurrentDocument();

    expect(fileTarget.pickTarget).toHaveBeenCalledTimes(1);
    expect(store().saveTarget).toBe('другая.pxlmt');
  });
});

describe('браузер без перезаписи', () => {
  beforeEach(() => fileTarget.isOverwriteSupported.mockReturnValue(false));

  it('скачивает копию и честно об этом говорит', async () => {
    await saveCurrentDocument();

    expect(downloadProjectFile).toHaveBeenCalledTimes(1);
    expect(downloadProjectFile.mock.calls[0][0]).toMatchObject({ fileName: 'лиса.pxlmt' });
    expect(fileTarget.pickTarget).not.toHaveBeenCalled();
    expect(store().dirty).toBe(false);
    expect(lastToast()).toMatch(/копи/i);
  });
});

describe('сохранить как', () => {
  it('спрашивает файл даже при готовой привязке', async () => {
    fileTarget.currentTarget.mockReturnValue({ name: 'лиса.pxlmt' });
    fileTarget.pickTarget.mockResolvedValue({ name: 'копия.pxlmt' });

    await saveDocumentAs();

    expect(fileTarget.pickTarget).toHaveBeenCalledTimes(1);
    expect(fileTarget.rememberTarget).toHaveBeenCalledWith({ name: 'копия.pxlmt' });
    expect(store().saveTarget).toBe('копия.pxlmt');
  });

  it('в анимации предлагает имя с расширением .pxlma', async () => {
    store().newDocument('animation', 4, 4, 'бег');
    fileTarget.pickTarget.mockResolvedValue({ name: 'бег.pxlma' });

    await saveDocumentAs();

    expect(fileTarget.pickTarget).toHaveBeenCalledWith('бег.pxlma');
  });
});

describe('без открытого документа', () => {
  it('ничего не сохраняет', async () => {
    store().closeDocument();

    await saveCurrentDocument();
    await saveDocumentAs();

    expect(fileTarget.writeTarget).not.toHaveBeenCalled();
    expect(fileTarget.pickTarget).not.toHaveBeenCalled();
    expect(downloadProjectFile).not.toHaveBeenCalled();
  });
});

describe('связь привязки с документом', () => {
  it('поднимает файл из прошлого сеанса', async () => {
    fileTarget.restoreTarget.mockResolvedValue('лиса.pxlmt');
    const stop = startSaveTarget();
    await vi.waitFor(() => expect(store().saveTarget).toBe('лиса.pxlmt'));
    stop();
  });

  it('прошлый сеанс без файла ничего не подставляет', async () => {
    fileTarget.restoreTarget.mockResolvedValue(null);
    const stop = startSaveTarget();
    await Promise.resolve();
    expect(store().saveTarget).toBeNull();
    stop();
  });

  it('смена документа заставляет забыть файл', async () => {
    fileTarget.restoreTarget.mockResolvedValue('лиса.pxlmt');
    const stop = startSaveTarget();
    await vi.waitFor(() => expect(store().saveTarget).toBe('лиса.pxlmt'));

    store().newDocument('texture', 4, 4, 'другой');

    expect(fileTarget.forgetTarget).toHaveBeenCalledTimes(1);
    expect(store().saveTarget).toBeNull();
    stop();
  });

  it('рисование забыть файл не заставляет', async () => {
    fileTarget.restoreTarget.mockResolvedValue('лиса.pxlmt');
    const stop = startSaveTarget();
    await vi.waitFor(() => expect(store().saveTarget).toBe('лиса.pxlmt'));

    store().paint([{ x: 1, y: 1 }]);

    expect(fileTarget.forgetTarget).not.toHaveBeenCalled();
    stop();
  });
});
