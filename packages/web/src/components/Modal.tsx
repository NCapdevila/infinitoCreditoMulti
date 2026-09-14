import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from './icons.tsx';

/**
 * C10 · Modal.
 *
 * Card blanca sobre la pantalla atenuada. La `X` es opcional: sólo el modal de
 * requisitos la tiene.
 */
interface ModalProps {
  readonly open: boolean;
  readonly onClose?: () => void;
  readonly title?: ReactNode;
  readonly eyebrow?: ReactNode;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
  readonly labelledBy?: string;
}

export function Modal({ open, onClose, title, eyebrow, children, actions }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape cierra sólo si el modal es cerrable.
  useEffect(() => {
    if (!open || onClose === undefined) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // El foco entra al modal para que el teclado no siga navegando el fondo.
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-gutter">
      <div className="absolute inset-0 bg-white/85 backdrop-blur-[2px]" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="rounded-modal relative flex w-full max-w-(--container-app) flex-col bg-white p-6 shadow-[0_8px_40px_rgba(0,0,0,0.12)] focus:outline-none md:max-w-[500px] md:p-8"
      >
        {onClose !== undefined && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-line absolute top-4 right-4"
          >
            <CloseIcon width={22} height={22} />
          </button>
        )}
        {eyebrow !== undefined && (
          <p className="text-muted text-center text-xs tracking-widest uppercase">{eyebrow}</p>
        )}
        {title !== undefined && (
          <h2 className="text-primary mt-2 text-center text-[26px] leading-tight font-semibold text-balance md:text-[32px]">
            {title}
          </h2>
        )}
        <div className="mt-6">{children}</div>
        {actions !== undefined && <div className="mt-8 flex flex-col gap-3">{actions}</div>}
      </div>
    </div>
  );
}
