/** Работа с файлами в браузере: загрузка, сохранение, диалоги выбора. */
import {
  ANIMATION_EXT,
  TEXTURE_EXT,
  parseProjectFile,
  serializeAnimation,
  serializeTexture,
  toFileName,
  type Animation,
  type Texture,
} from '~/core';

/** Скачивает произвольные данные под нужным именем. */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Даём браузеру дочитать поток перед освобождением.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Имя файла и его содержимое — до того, как решено, куда это класть. */
export interface ProjectFile {
  fileName: string;
  json: string;
}

/** Текстура как файл `.pxlmt`. */
export function textureFile(texture: Texture): ProjectFile {
  return { fileName: toFileName(texture.name, TEXTURE_EXT), json: serializeTexture(texture) };
}

/** Анимация как файл `.pxlma`. */
export function animationFile(animation: Animation): ProjectFile {
  return { fileName: toFileName(animation.name, ANIMATION_EXT), json: serializeAnimation(animation) };
}

/** Скачивает готовый файл проекта копией в «Загрузки». */
export function downloadProjectFile({ fileName, json }: ProjectFile): string {
  downloadBlob(fileName, new Blob([json], { type: 'application/json' }));
  return fileName;
}

/** Скачивает текстуру в `.pxlmt`. */
export function saveTexture(texture: Texture): string {
  return downloadProjectFile(textureFile(texture));
}

/** Скачивает анимацию в `.pxlma`. */
export function saveAnimation(animation: Animation): string {
  return downloadProjectFile(animationFile(animation));
}

/** Читает файл как текст. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать файл'));
    reader.readAsText(file);
  });
}

/** Разбирает выбранный файл проекта. */
export async function readProjectFile(file: File) {
  return parseProjectFile(file.name, await readFileAsText(file));
}

/** Открывает системный диалог выбора файла. */
export function pickFile(accept = `${TEXTURE_EXT},${ANIMATION_EXT}`): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    // Пользователь мог закрыть диалог — тогда change не придёт, чистим по фокусу.
    window.addEventListener(
      'focus',
      () => setTimeout(() => input.isConnected && input.remove(), 500),
      { once: true },
    );
    document.body.append(input);
    input.click();
  });
}
