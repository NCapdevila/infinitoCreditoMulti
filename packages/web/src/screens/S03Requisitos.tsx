import { Button } from '../components/Button.tsx';
import { Modal } from '../components/Modal.tsx';

/**
 * S03 · Modal «Requisitos para emitir la póliza».
 *
 * Setea expectativas antes de una carga larga: nueve fotos y datos de pago.
 *
 * Falta resolver (spec 7.2): qué hace la `X`. Acá cierra el modal y deja al
 * usuario en S02, que es lo menos destructivo, pero hay que confirmarlo.
 */
interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onNext: () => void;
}

const REQUISITOS = [
  'Datos del asegurado',
  'Datos del Vehículo',
  '9 Fotos del Vehículo',
  'Medio de pago (CBU o Tarjeta de crédito)',
];

function DocumentoIlustracion() {
  return (
    <svg viewBox="0 0 200 160" className="mx-auto h-36 w-auto" role="img" aria-hidden="true">
      <path
        d="M38 78c-6-30 14-56 44-60s58 10 66 36 2 54-22 66-58 8-72-8-10-22-16-34Z"
        fill="var(--color-primary)"
        opacity="0.1"
      />
      <path
        d="M74 42h38l20 20v58a6 6 0 0 1-6 6H74a6 6 0 0 1-6-6V48a6 6 0 0 1 6-6Z"
        fill="var(--color-primary)"
      />
      <path d="M112 42l20 20h-20V42Z" fill="var(--color-navy)" />
    </svg>
  );
}

export function S03Requisitos({ open, onClose, onNext }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Requisitos para emitir la póliza:"
      actions={<Button onClick={onNext}>Siguiente</Button>}
    >
      <DocumentoIlustracion />
      <ul className="text-muted mt-6 flex list-disc flex-col gap-1 pl-5 text-sm">
        {REQUISITOS.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </Modal>
  );
}
