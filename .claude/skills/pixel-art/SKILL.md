---
name: pixel-art
description: Рисование текстур и анимаций Pixelmation без интерфейса — через CLI `npm run pxl` и через window.pixelmation в браузере. Использовать, когда нужно создать, изменить или посмотреть файл .pxlmt / .pxlma, отрендерить PNG или собрать GIF.
---

# Рисование в Pixelmation

## Сначала посмотри, потом рисуй

Холст читается текстом — картинка не нужна:

```bash
npm run pxl -- show hero.pxlmt --rulers
```

`.` — прозрачная клетка, цифры и буквы — цвета, расшифровка печатается снизу.
Линейки по краям помогают целиться в конкретный пиксель.

## Текстура

```bash
npm run pxl -- new texture hero.pxlmt 32 32 --name hero
npm run pxl -- draw hero.pxlmt \
  --ascii "..###..|.#####.|#######" --legend "#=#6d8bffff" --x 12 --y 10 \
  --fill 0,0,"#0b0e14ff"
npm run pxl -- render hero.pxlmt hero.png --scale 10
```

Цвета с `#` бери в кавычки. Операции применяются по порядку и сразу
сохраняются; после выполнения печатается превью.

## Анимация

```bash
npm run pxl -- new animation run.pxlma 16 16 --name run
npm run pxl -- draw run.pxlma --ascii ".##.|####" --legend "#=#ffcc00ff" --x 6 --y 6
npm run pxl -- slides run.pxlma copy --index 1
npm run pxl -- draw run.pxlma --slide 2 --shift 0,1
npm run pxl -- gif run.pxlma run.gif --scale 12 --delay 150
```

Кадр хранит ссылки на пиксели текстуры, но в аргументах можно писать обычный
цвет: он сам займёт свободную клетку текстуры. Явная ссылка пишется как `x:y`,
пустая клетка — `null`.

## В живом редакторе

Если открыт дев-сервер, тем же самым можно управлять из вкладки браузера:

```js
const p = window.pixelmation;
p.newTexture(32, 32, 'герой');
p.drawAscii(['..##..', '.####.'], { '#': '#6d8bffff' }, { x: 4, y: 4 });
p.preview();          // текстовая карта
p.pngDataUrl({ scale: 8 });
```

Полный список команд — `p.help()` и `docs/agent-api.md`.

## Чего не делать

- Не редактируй `.pxlmt` и `.pxlma` вручную текстом — используй CLI или API,
  иначе легко разъехаться с форматом.
- Не рисуй в анимации цветами, которых нет в текстуре, если важен точный
  порядок пикселей в ней: сначала подготовь текстуру, потом кадры.
- Не ставь размер больше 512 — дальше редактор откажется.
