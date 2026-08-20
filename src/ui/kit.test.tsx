import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NumberInput } from './kit';

/** Обёртка-контейнер: поле управляемое, как в настоящих экранах. */
function Harness({ initial = 32 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NumberInput value={value} min={1} max={512} onChange={setValue} aria-label="Ширина" />
      <output>{value}</output>
    </>
  );
}

const field = () => screen.getByLabelText('Ширина') as HTMLInputElement;

describe('NumberInput', () => {
  it('даёт стереть поле целиком и набрать заново', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.clear(field());
    expect(field().value).toBe('');

    await user.type(field(), '8');
    expect(field().value).toBe('8');
    expect(screen.getByRole('status', { hidden: true }).textContent).toBe('8');
  });

  it('стирание по одной цифре не подставляет минимум', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(field());
    await user.keyboard('{Backspace}{Backspace}');
    expect(field().value).toBe('');
  });

  it('пустое поле при потере фокуса возвращает прежнее значение', async () => {
    const user = userEvent.setup();
    render(<Harness initial={24} />);

    await user.clear(field());
    await user.tab();
    expect(field().value).toBe('24');
  });

  it('приводит к границам только при потере фокуса', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.clear(field());
    await user.type(field(), '999');
    expect(field().value).toBe('999');

    await user.tab();
    expect(field().value).toBe('512');
  });

  it('не пускает в поле буквы', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.clear(field());
    await user.type(field(), '1a2b');
    expect(field().value).toBe('12');
  });
});
