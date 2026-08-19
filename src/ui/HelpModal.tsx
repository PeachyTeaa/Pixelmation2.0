import { Modal } from './kit';

const HOTKEYS: Array<[string, string]> = [
  ['A / ←', 'предыдущий кадр (с первого — на последний)'],
  ['D / →', 'следующий кадр (с последнего — на первый)'],
  ['Ctrl+Z', 'отменить действие'],
  ['Ctrl+Shift+Z, Ctrl+Y', 'вернуть отменённое'],
  ['Ctrl+S', 'сохранить файл'],
  ['E', 'прозрачность как текущий цвет или ссылка'],
  ['G', 'инструмент «заливка»'],
  ['F', 'инструмент «двигать изображение»'],
  ['B / X / I', 'кисть / ластик / пипетка'],
  ['L / R / O', 'линия / прямоугольник / эллипс'],
  ['Shift+G', 'показать или скрыть сетку'],
  ['Пробел', 'проиграть анимацию'],
  ['?', 'эта справка'],
];

export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Как это работает" onClose={onClose}>
      <section style={{ display: 'grid', gap: '0.75rem' }}>
        <p>
          <strong>Текстура</strong> — холст из пикселей. ЛКМ рисует выбранным цветом, ПКМ работает
          пипеткой, зажатая кнопка ведёт линию. Сохраняется в <code>.pxlmt</code>.
        </p>
        <p>
          <strong>Анимация</strong> — кадры, где каждая клетка ссылается на пиксель привязанной
          текстуры. Цвет выбирается кликом по превью текстуры слева, ПКМ на холсте копирует ссылку.
          Сохраняется в <code>.pxlma</code> вместе с текстурой; вкладка «Текстура» позволяет
          подправить её и вернуться к кадрам.
        </p>
        <p>
          Файлы можно перетащить прямо в окно. Прогресс хранится в браузере, но перед закрытием
          вкладки лучше нажать <kbd>Ctrl+S</kbd>.
        </p>
      </section>

      <section>
        <h3 style={{ marginBottom: '0.5rem' }}>Горячие клавиши</h3>
        <div style={{ display: 'grid', gap: '0.3rem' }}>
          {HOTKEYS.map(([keys, description]) => (
            <div
              key={keys}
              style={{ display: 'grid', gridTemplateColumns: '11rem 1fr', gap: '0.6rem' }}
            >
              <code style={{ color: 'var(--accent)' }}>{keys}</code>
              <span style={{ color: 'var(--text-2)' }}>{description}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: '0.5rem' }}>Для агента</h3>
        <p style={{ color: 'var(--text-2)' }}>
          В консоли доступен объект <code>window.pixelmation</code> — полный набор команд рисования,
          экспорта и текстового превью холста. Список методов: <code>pixelmation.help()</code>.
        </p>
      </section>
    </Modal>
  );
}
