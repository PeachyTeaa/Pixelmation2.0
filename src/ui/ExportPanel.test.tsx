import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPixel } from '~/core';
import { useEditorStore } from '~/state/store';
import { ExportPanel } from './ExportPanel';

const store = () => useEditorStore.getState();

/** Перехватывает скачивание файла и отдаёт имя, под которым его сохранили. */
function captureDownload() {
  const names: string[] = [];
  // В jsdom объектных URL нет — подставляем заглушки.
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:тест', revokeObjectURL: () => {} }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download);
  });
  return names;
}

describe('панель экспорта', () => {
  beforeEach(() => {
    localStorage.clear();
    store().newDocument('animation', 4, 4, 'бег');
    useEditorStore.setState({ texture: setPixel(store().texture, 0, 0, '#00ff00ff') });
  });

  afterEach(() => vi.restoreAllMocks());

  it('на вкладке кадров текстуру отдельно не экспортирует', () => {
    render(<ExportPanel />);
    expect(screen.queryByRole('button', { name: /Текстура \.pxlmt/ })).toBeNull();
  });

  it('на вкладке текстуры сохраняет её в .pxlmt под именем документа', async () => {
    const downloads = captureDownload();
    store().setAnimationTab('texture');
    render(<ExportPanel />);

    await userEvent.click(screen.getByRole('button', { name: /Текстура \.pxlmt/ }));

    expect(downloads).toEqual(['бег.pxlmt']);
  });

  it('сохранение текстуры не помечает анимацию сохранённой', async () => {
    captureDownload();
    store().paint([{ x: 1, y: 1 }]);
    store().setAnimationTab('texture');
    render(<ExportPanel />);

    await userEvent.click(screen.getByRole('button', { name: /Текстура \.pxlmt/ }));

    expect(store().dirty).toBe(true);
  });
});
