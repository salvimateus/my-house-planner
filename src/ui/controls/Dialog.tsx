import { X } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { cx } from './cx.ts';
import { IconButton } from './IconButton.tsx';
import './Dialog.css';

export type DialogProps = {
  open: boolean;
  onClose(): void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

/** Native modal `<dialog>`: focus trap, Escape and top layer come from the browser. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: DialogProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onNativeClose = () => {
      if (openRef.current) onCloseRef.current();
    };
    el.addEventListener('close', onNativeClose);
    return () => el.removeEventListener('close', onNativeClose);
  }, []);

  useEffect(
    () => () => {
      if (ref.current?.open) ref.current.close();
    },
    [],
  );

  return (
    <dialog
      ref={ref}
      className={cx('dialog', `dialog-${size}`, className)}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-desc` : undefined}
      onPointerDown={(e) => {
        // A press on the backdrop targets the dialog element itself.
        if (e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      <div className="dialog-frame">
        <header className="dialog-head">
          <div className="dialog-titles">
            <h2 id={`${id}-title`} className="dialog-title">
              {title}
            </h2>
            {description ? (
              <p id={`${id}-desc`} className="dialog-desc">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Fechar" icon={<X />} onClick={() => onCloseRef.current()} />
        </header>
        <div className="dialog-body">{children}</div>
        {footer ? <footer className="dialog-foot">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
