import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import styles from './kit.module.css';

const cx = (...values: Array<string | false | null | undefined>): string =>
  values.filter(Boolean).join(' ');

/** Мелкая подпись капсом — основной характер интерфейса. */
export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label className={styles.label} htmlFor={htmlFor}>
      {children}
    </label>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger';
  size?: 'md' | 'sm';
  active?: boolean;
  block?: boolean;
  icon?: boolean;
}

export function Button({
  variant = 'default',
  size = 'md',
  active,
  block,
  icon,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        styles.button,
        variant === 'primary' && styles.primary,
        variant === 'danger' && styles.danger,
        size === 'sm' && styles.small,
        active && styles.active,
        block && styles.block,
        icon && styles.icon,
        className,
      )}
      {...rest}
    />
  );
}

/** Стеклянная панель с необязательным заголовком. */
export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx(styles.panel, className)}>
      {(title || actions) && (
        <header className={styles.panelHead}>
          {typeof title === 'string' ? <span className={styles.label}>{title}</span> : title}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

/** Сетка плиток-показателей. */
export function Tiles({ children }: { children: ReactNode }) {
  return <div className={styles.tiles}>{children}</div>;
}

/** Плитка показателя: крупное значение и мелкий капс-лейбл. */
export function Tile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className={styles.tile}>
      <div className={styles.label}>{label}</div>
      <div className={styles.tileValue}>{value}</div>
      {hint && <div className={styles.tileHint}>{hint}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <Label>{label}</Label>
      {children}
      {hint && <div className={styles.tileHint}>{hint}</div>}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(styles.input, className)} {...rest} />;
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.row, className)}>{children}</div>;
}

export function Spread({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.spread, className)}>{children}</div>;
}

export function Switch({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className={styles.switch}>
      <span className={cx(styles.switchTrack, checked && styles.switchOn)}>
        <span className={styles.switchKnob} />
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
      />
      <span className={styles.label}>{children}</span>
    </label>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Широкое окно — для списков и галерей. */
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={styles.overlay} onMouseDown={onClose} role="presentation">
      <div
        className={cx(styles.modal, wide && styles.modalWide)}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className={styles.modalHead}>
          <h2>{title}</h2>
          <Button icon onClick={onClose} aria-label="Закрыть">
            ✕
          </Button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}

/** Сообщение для всплывающих уведомлений. */
export interface ToastMessage {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

export function Toasts({ items }: { items: ToastMessage[] }) {
  return (
    <div className={styles.toasts}>
      {items.map((item) => (
        <div key={item.id} className={cx(styles.toast, item.kind === 'error' && styles.toastError)}>
          <span className={styles.toastMark} />
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
