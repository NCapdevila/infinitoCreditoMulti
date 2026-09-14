import type { ComponentType, ReactNode, SVGProps } from 'react';
import { PencilIcon } from './icons.tsx';

/**
 * C6 · Fila de dato y C7 · Card de contexto.
 *
 * La fila se usa suelta en las listas de resumen; la card agrupa datos que
 * vienen de la cotización y no se editan en esa pantalla.
 */
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface DataRowProps {
  readonly icon: Icon;
  readonly children: ReactNode;
  /** Handler de edición. Sin él no se dibuja el lápiz. */
  readonly onEdit?: () => void;
  /** Etiqueta del lápiz, para lectores de pantalla. */
  readonly editLabel?: string;
  /** El valor es accionable, ej. un teléfono. */
  readonly emphasis?: boolean;
}

export function DataRow({ icon: Icon, children, onEdit, editLabel, emphasis }: DataRowProps) {
  return (
    <div className="flex items-center gap-4 border-b border-black/5 py-4">
      <Icon width={24} height={24} className="text-muted shrink-0" />
      <div className={`flex-1 text-sm ${emphasis === true ? 'text-primary' : 'text-muted'}`}>
        {children}
      </div>
      {onEdit !== undefined && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={editLabel ?? 'Editar'}
          className="text-line shrink-0"
        >
          <PencilIcon width={20} height={20} />
        </button>
      )}
    </div>
  );
}

export function DataList({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

interface ContextCardProps {
  readonly icon?: Icon;
  /** Logo de marca, cuando el motor lo provee. */
  readonly logoUrl?: string;
  readonly title: ReactNode;
  readonly detail?: ReactNode;
  readonly children?: ReactNode;
}

export function ContextCard({ icon: Icon, logoUrl, title, detail, children }: ContextCardProps) {
  return (
    <div className="bg-surface flex items-center gap-4 rounded-field border border-black/5 p-4">
      {logoUrl !== undefined && (
        <img src={logoUrl} alt="" className="h-10 w-16 shrink-0 object-contain" />
      )}
      {Icon !== undefined && <Icon width={36} height={36} className="text-muted shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-ink text-sm font-semibold">{title}</p>
        {detail !== undefined && <p className="text-muted text-sm">{detail}</p>}
        {children}
      </div>
    </div>
  );
}
