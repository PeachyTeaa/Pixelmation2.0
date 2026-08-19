# Инструменты агента

У Pixelmation два входа для агента: живой редактор в браузере
(`window.pixelmation`) и командная строка (`npm run pxl`). Оба работают поверх
одного ядра `src/core`, поэтому результат одинаков.

## Как «видеть» холст

Картинка агенту не нужна — есть текстовое превью:

```js
pixelmation.preview({ rulers: true })
```

```
  0000000000111111
  0123456789012345
 0 ................
 1 .....000000.....
 2 ...0000000000...
 3 ..000..0000..000
```

Символ `.` — прозрачная клетка, цифры и буквы — цвета в порядке частоты.
Расшифровка: `pixelmation.legend()` → `[{ symbol: '0', color: '#6d8bffff', count: 42 }]`.

Если нужна именно картинка: `pixelmation.pngDataUrl({ scale: 8 })` вернёт
data-URL, а в CLI `pxl render` запишет PNG-файл, который можно открыть.

## `window.pixelmation`

Все методы возвращают JSON-совместимые данные: почти все — сводку состояния
(`{ mode, name, width, height, surface, slides, currentSlide, painted, colors,
color, currentRef, tool, dirty }`), поэтому после каждого вызова видно, что
получилось. `pixelmation.help()` печатает шпаргалку прямо в консоли.

### Документ

| Метод | Что делает |
| --- | --- |
| `newTexture(w, h, name?)` | новый холст текстуры |
| `newAnimation(w, h, name?)` | новая анимация с пустой текстурой |
| `openFile(fileName, content)` | открыть содержимое `.pxlmt` или `.pxlma` (в том числе legacy) |
| `loadTexture(data)` / `loadAnimation(data)` | загрузить объект или JSON-строку |
| `close()` | вернуться на стартовый экран |
| `setName(name)` | переименовать документ |
| `toJSON()` / `textureJSON()` | сериализовать текущий документ / его текстуру |
| `download({legacy})` | скачать файл браузером |

### Рисование

| Метод | Что делает |
| --- | --- |
| `setColor(color)` | текущий цвет (`null` — прозрачность) |
| `setRef(ref)` | ссылка для анимации: `{x,y}`, `null` или цвет |
| `setTool(tool)` | `pen`, `eraser`, `fill`, `line`, `rect`, `ellipse`, `picker`, `move` |
| `pick(x, y)` | пипетка |
| `setPixel(x, y, color?)` | один пиксель |
| `setPixels(points, color?)` | массив точек: `[[x,y], …]` или `[{x,y}, …]` |
| `erase(points)` | стереть точки |
| `line(x0,y0,x1,y1,color?)` | отрезок |
| `rect(x0,y0,x1,y1,color?,filled?)` | прямоугольник |
| `ellipse(x0,y0,x1,y1,color?,filled?)` | эллипс |
| `fill(x, y, color?)` | заливка связной области |
| `drawAscii(rows, legend, origin?)` | целый рисунок одной командой |
| `clear()` | очистить холст или кадр |
| `shift(dx, dy, {wrap})` | сдвинуть содержимое |
| `resize(w, h)` | сменить размер холста |
| `undo()` / `redo()` | история |

`drawAscii` — самый быстрый способ нарисовать спрайт:

```js
pixelmation.drawAscii(
  [
    '..####..',
    '.######.',
    '##.##.##',
    '########',
  ],
  { '#': '#6d8bffff', '.': null },
  { x: 4, y: 6 },
);
```

Символы, которых нет в легенде, пропускаются — можно оставлять пробелы как
«не трогать эту клетку». Значение `null` в легенде стирает клетку.

### Анимация

| Метод | Что делает |
| --- | --- |
| `slides()` | список кадров с числом закрашенных клеток |
| `gotoSlide(i)`, `nextSlide()`, `prevSlide()` | переключение (по кругу) |
| `addSlide()` | пустой кадр после текущего |
| `duplicateSlide()` | копия текущего кадра |
| `deleteSlide()` | удалить (последний кадр очищается) |
| `moveSlide(from, to)` | переставить кадр |
| `insertTextureSlide()` | вставить текстуру целиком как кадр |
| `editTexture(true/false)` | переключиться на правку текстуры и обратно |
| `play(true/false)`, `setSpeed(ms)` | проигрывание |
| `gifDataUrl({scale, delayMs})` | собрать GIF |

В анимации цвет можно передавать напрямую: `setPixel(3, 4, '#ffcc00ff')`.
Если такого цвета в текстуре нет, он займёт первую свободную клетку текстуры,
и в кадр запишется ссылка на неё. Хочется контролировать вручную — передавайте
ссылку: `setPixel(3, 4, { x: 0, y: 0 })`.

### Вид

`setGrid(bool)`, `setTheme('dark' | 'light')`, `say(text)` — показать
уведомление в интерфейсе.

## Командная строка `pxl`

```bash
npm run pxl -- <команда> [аргументы]
```

| Команда | Пример |
| --- | --- |
| `new` | `pxl new animation run.pxlma 32 32 --name run` |
| `info` | `pxl info run.pxlma` |
| `show` | `pxl show run.pxlma --slide 2 --rulers` |
| `render` | `pxl render hero.pxlmt hero.png --scale 12 --bg "#0b0e14"` |
| `gif` | `pxl gif run.pxlma run.gif --scale 8 --delay 150` |
| `draw` | `pxl draw hero.pxlmt --line 0,0,15,15,"#f04438ff"` |
| `slides` | `pxl slides run.pxlma copy --index 1` |
| `convert` | `pxl convert hero.pxlmt hero-v1.pxlmt --legacy` |

Операции `draw` применяются в том порядке, в каком написаны, и все сразу
сохраняются в файл; после выполнения печатается ASCII-превью результата.

```bash
npm run pxl -- draw hero.pxlmt \
  --rect 2,2,13,13,"#6d8bffff" \
  --fill 7,7,"#3ddcedff" \
  --ascii "..#..|.###.|#####" --legend "#=#f04438ff" --x 5 --y 5
```

Для анимации значением может быть цвет, ссылка `x:y` или `null`; номер кадра
задаётся флагом `--slide` (нумерация с единицы, координаты — с нуля).

Цвета, начинающиеся с `#`, лучше брать в кавычки — иначе оболочка может
принять их за комментарий.

## Управление живым редактором из внешнего инструмента

Через автоматизацию браузера (например, Claude in Chrome) достаточно
выполнить JavaScript на открытой вкладке:

```js
const p = window.pixelmation;
p.newTexture(32, 32, 'герой');
p.drawAscii(rows, legend);
p.preview();
```

Все изменения проходят через то же хранилище, что и действия мышью, поэтому
работают история отмен, автосохранение в localStorage и предупреждение о
несохранённых данных.
