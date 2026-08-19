import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAnimation, createTexture, setPixel, setRef } from '~/core';
import {
  VAULT_LIMIT,
  clearSnapshots,
  deleteSnapshot,
  isWorthSaving,
  listSnapshots,
  readSnapshot,
  saveSnapshot,
} from './vault';

function texture(color = '#ff0000ff') {
  return setPixel(createTexture(4, 4, 'герой'), 1, 1, color);
}

beforeEach(async () => {
  await clearSnapshots();
});

describe('архив восстановления', () => {
  it('кладёт текстуру и отдаёт карточку', async () => {
    const meta = await saveSnapshot({ kind: 'texture', texture: texture(), slides: [], name: 'герой' });
    expect(meta).toMatchObject({ kind: 'texture', name: 'герой', width: 4, height: 4, frames: 1, painted: 1 });
    expect(await listSnapshots()).toHaveLength(1);
  });

  it('не хранит пустые документы', async () => {
    const meta = await saveSnapshot({
      kind: 'texture',
      texture: createTexture(8, 8),
      slides: [],
      name: 'пусто',
    });
    expect(meta).toBeNull();
    expect(await listSnapshots()).toHaveLength(0);
    expect(isWorthSaving({ kind: 'texture', texture: createTexture(4, 4), slides: [], name: '' })).toBe(false);
  });

  it('не дублирует одинаковое содержимое, даже если между ними были другие снимки', async () => {
    const input = { kind: 'texture' as const, texture: texture(), slides: [], name: 'герой' };
    await saveSnapshot(input);
    expect(await saveSnapshot(input)).toBeNull();
    expect(await listSnapshots()).toHaveLength(1);

    await saveSnapshot({ ...input, texture: texture('#00ff00ff') });
    expect(await listSnapshots()).toHaveLength(2);

    // возврат к прежнему состоянию новой карточки не создаёт
    expect(await saveSnapshot(input)).toBeNull();
    expect(await listSnapshots()).toHaveLength(2);
  });

  it('возвращает содержимое без потерь', async () => {
    const source = texture('#00ff0080');
    const meta = await saveSnapshot({ kind: 'texture', texture: source, slides: [], name: 'герой' });
    const record = await readSnapshot(meta!.id);
    expect(record?.kind).toBe('texture');
    if (record?.kind !== 'texture') throw new Error('ожидалась текстура');
    expect(record.texture.cells).toEqual(source.cells);
    expect(record.texture.name).toBe('герой');
  });

  it('хранит анимацию вместе с кадрами и ссылками', async () => {
    const animation = setRef(createAnimation(texture(), 'бег'), 0, 2, 2, { x: 1, y: 1 });
    const meta = await saveSnapshot({
      kind: 'animation',
      texture: animation.texture,
      slides: animation.slides,
      name: 'бег',
    });
    expect(meta).toMatchObject({ kind: 'animation', frames: 1, painted: 1 });

    const record = await readSnapshot(meta!.id);
    if (record?.kind !== 'animation') throw new Error('ожидалась анимация');
    expect(record.animation.name).toBe('бег');
    expect(record.animation.slides[0][2][2]).toEqual({ x: 1, y: 1 });
    expect(record.animation.texture.cells[1][1]).toBe('#ff0000ff');
  });

  it('новые снимки идут первыми', async () => {
    await saveSnapshot({ kind: 'texture', texture: texture('#111111ff'), slides: [], name: 'первый' });
    await saveSnapshot({ kind: 'texture', texture: texture('#222222ff'), slides: [], name: 'второй' });
    const list = await listSnapshots();
    expect(list.map((item) => item.name)).toEqual(['второй', 'первый']);
  });

  it('удаляет снимок целиком', async () => {
    const meta = await saveSnapshot({ kind: 'texture', texture: texture(), slides: [], name: 'герой' });
    await deleteSnapshot(meta!.id);
    expect(await listSnapshots()).toHaveLength(0);
    expect(await readSnapshot(meta!.id)).toBeNull();
  });

  it('не растёт выше лимита и выбрасывает самые старые', async () => {
    for (let i = 0; i < VAULT_LIMIT + 5; i++) {
      const color = `#${i.toString(16).padStart(6, '0')}ff`;
      await saveSnapshot({ kind: 'texture', texture: texture(color), slides: [], name: `снимок ${i}` });
    }
    const list = await listSnapshots();
    expect(list).toHaveLength(VAULT_LIMIT);
    expect(list[0].name).toBe(`снимок ${VAULT_LIMIT + 4}`);
    expect(list.some((item) => item.name === 'снимок 0')).toBe(false);
  }, 30000);
});
