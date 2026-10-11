import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CircleAlert, LoaderCircle, X } from 'lucide-react';

export interface ActionLock {
  busy: boolean;
  begin: () => boolean;
  end: () => void;
}

const avatarTones = ['clay', 'sage', 'gold', 'rose', 'blue'] as const;

export function Avatar({
  initials,
  color = '',
  large = false,
}: {
  initials: string;
  color?: string;
  large?: boolean;
}) {
  const namedTone = avatarTones.find((tone) => color.toLowerCase().includes(tone));
  const hash = [...(color || initials)].reduce((total, character) => total + character.charCodeAt(0), 0);
  const tone = namedTone ?? avatarTones[hash % avatarTones.length];
  return (
    <span className={`avatar avatar--${tone}${large ? ' avatar--large' : ''}`} aria-hidden="true">
      {initials}
    </span>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand${compact ? ' brand--compact' : ''}`}>
      <img src="/mark.svg" width="36" height="36" alt="" />
      {!compact && <span>THIRD PLACE<span className="brand-period">.</span></span>}
    </span>
  );
}

export function Spinner({ label = 'Working' }: { label?: string }) {
  return <LoaderCircle size={17} className="spinner" aria-label={label} role="img" />;
}

export function ErrorNotice({
  message,
  onRetry,
  retryLabel = 'Try again',
  disabled = false,
}: {
  message: string | null | undefined;
  onRetry?: () => void;
  retryLabel?: string;
  disabled?: boolean;
}) {
  if (!message) return null;
  return (
    <div className="error-notice" role="alert">
      <CircleAlert size={18} aria-hidden="true" />
      <div>
        <p>{message}</p>
        {onRetry && (
          <button type="button" className="text-button" onClick={onRetry} disabled={disabled}>
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function Dialog({
  title,
  eyebrow,
  children,
  onClose,
  drawer = false,
  busy = false,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  drawer?: boolean;
  busy?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog ${drawer ? 'dialog--drawer' : ''} ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="dialog-inner">
        <button
          className="icon-button dialog-close"
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
          disabled={busy}
        >
          <X size={20} />
        </button>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 id={titleId} className="dialog-title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  const id = useId();
  return (
    <div className="toggle-row">
      <div>
        <span id={`${id}-label`} className="toggle-label">{label}</span>
        <p id={`${id}-description`}>{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        className="toggle"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        disabled={disabled}
        onClick={onChange}
      >
        <span />
      </button>
    </div>
  );
}

export function formatDate(value: string, includeTime = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(includeTime ? { hour: 'numeric' as const, minute: '2-digit' as const } : {}),
  }).format(date);
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}
