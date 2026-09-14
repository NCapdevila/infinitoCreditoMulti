import type { ReactNode } from 'react';
import { ChevronDownIcon } from './icons.tsx';

/**
 * C5 · Selección excluyente que se expande en un formulario.
 *
 * Usado en persona física/jurídica y en tarjeta/CBU. Al abrir una opción la
 * otra se oculta, como en el prototipo; a diferencia del prototipo, la abierta
 * se puede volver a cerrar para cambiar de opción sin reiniciar el paso.
 */
export interface ChoiceItem {
  readonly value: string;
  readonly label: string;
  readonly content: ReactNode;
}

interface AccordionChoiceProps {
  readonly items: readonly ChoiceItem[];
  readonly selected: string | null;
  readonly onSelect: (value: string | null) => void;
  /** Nombre del grupo, para lectores de pantalla. */
  readonly label: string;
}

export function AccordionChoice({ items, selected, onSelect, label }: AccordionChoiceProps) {
  const visible = selected === null ? items : items.filter((i) => i.value === selected);

  return (
    <div className="flex flex-col gap-4" role="group" aria-label={label}>
      {visible.map((item) => {
        const open = item.value === selected;
        return (
          <div key={item.value} className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => onSelect(open ? null : item.value)}
              aria-expanded={open}
              className="bg-surface flex h-14 w-full items-center justify-between rounded-field border border-black/10 px-4"
            >
              <span className="text-ink text-base">{item.label}</span>
              <ChevronDownIcon
                width={20}
                height={20}
                className={`text-ink transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>
            {open && <div className="flex flex-col gap-5">{item.content}</div>}
          </div>
        );
      })}
    </div>
  );
}
