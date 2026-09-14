import { useId, useRef, useState, type ReactNode } from 'react';
import { ARCHIVO } from '../lib/contratacion.ts';
import { CheckCircleIcon, ClipIcon, DocumentIcon } from './icons.tsx';

/**
 * C8 · Zonas de adjunto y C9 · Fila del checklist de fotos.
 *
 * El prototipo no diseñó los errores de carga (spec 5.3). Acá se muestran
 * inline y en rojo, que es lo mínimo para que el usuario entienda por qué su
 * archivo no entró; el tratamiento definitivo lo tiene que dar diseño.
 */

/** Devuelve el motivo del rechazo, o null si el archivo sirve. */
export function validarArchivo(file: File): string | null {
  const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  if (!ARCHIVO.extensiones.includes(extension as (typeof ARCHIVO.extensiones)[number])) {
    return `Solo aceptamos ${ARCHIVO.extensiones.join(', ')}.`;
  }
  if (file.size > ARCHIVO.maxBytes) {
    const peso = (file.size / 1024 / 1024).toFixed(1);
    return `El archivo pesa ${peso} MB y el máximo es ${ARCHIVO.maxLabel}.`;
  }
  return null;
}

function IconoSubir({ listo }: { listo: boolean }) {
  return listo ? (
    <CheckCircleIcon width={24} height={24} className="text-success shrink-0" />
  ) : (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="text-muted shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.2" />
      <path d="M12 16V8m0 0-3 3m3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface AdjuntoProps {
  readonly label: ReactNode;
  readonly nombreArchivo: string | null;
  readonly onFile: (file: File) => void;
  readonly accept?: string;
}

/** Variante compacta: una fila con el nombre del documento y el botón de subir. */
export function AdjuntoCompacto({ label, nombreArchivo, onFile, accept }: AdjuntoProps) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const cargado = nombreArchivo !== null;

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="rounded-field border-line flex cursor-pointer items-center gap-3 border p-4"
      >
        <DocumentIcon width={26} height={26} className="text-primary shrink-0" />
        <span className="text-muted flex-1 text-sm">{cargado ? nombreArchivo : label}</span>
        <IconoSubir listo={cargado} />
        <input
          id={id}
          type="file"
          accept={accept ?? ARCHIVO.accept}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file === undefined) return;
            const motivo = validarArchivo(file);
            setError(motivo);
            if (motivo === null) onFile(file);
          }}
        />
      </label>
      {error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** Variante dropzone: el área grande del modal de captura. */
export function Dropzone({ onFile }: { readonly onFile: (file: File) => void }) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [sobre, setSobre] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const tomar = (file: File | undefined) => {
    if (file === undefined) return;
    const motivo = validarArchivo(file);
    setError(motivo);
    if (motivo === null) onFile(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          setSobre(true);
        }}
        onDragLeave={() => setSobre(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSobre(false);
          tomar(e.dataTransfer.files[0]);
        }}
        className={`rounded-field flex cursor-pointer flex-col items-center gap-2 border border-dashed px-4 py-8 text-center transition-colors ${
          sobre ? 'border-primary bg-primary/5' : 'border-line'
        }`}
      >
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          className="text-muted"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="14" height="14" rx="2" />
          <path d="m5 16 4-4 3 3 2-2 3 3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19 4v6m3-3h-6" strokeLinecap="round" />
        </svg>
        <span className="text-ink text-sm font-semibold">Toca para subir una foto</span>
        <span className="text-muted text-xs">Seleccionar desde Galería o Cámara</span>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={ARCHIVO.accept}
          capture="environment"
          className="sr-only"
          onChange={(e) => tomar(e.target.files?.[0])}
        />
      </label>
      {error !== null && (
        <p role="alert" className="text-center text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

interface FilaTomaProps {
  readonly label: string;
  readonly tip?: string;
  readonly previewUrl?: string;
  readonly cargada: boolean;
  readonly onClick: () => void;
}

/**
 * C9 · Fila del checklist: miniatura, nombre y estado.
 *
 * Mientras la toma está pendiente, la miniatura muestra la foto de ejemplo
 * atenuada: sirve de referencia sin que se confunda con una foto ya sacada.
 */
export function FilaToma({ label, tip, previewUrl, cargada, onClick }: FilaTomaProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-field border-line/60 flex w-full items-center gap-3 border p-2.5 text-left"
    >
      <span className="bg-surface size-12 shrink-0 overflow-hidden rounded-md">
        {previewUrl !== undefined && (
          <img
            src={previewUrl}
            alt=""
            className={`size-full object-cover ${cargada ? '' : 'opacity-45'}`}
          />
        )}
      </span>
      <span className="text-ink flex-1 text-sm">
        {label}
        {tip !== undefined && (
          <span
            title={tip}
            className="bg-surface text-muted ml-2 inline-flex size-4 items-center justify-center rounded-full align-middle text-[10px]"
            aria-label={tip}
          >
            ?
          </span>
        )}
      </span>
      {cargada ? (
        <CheckCircleIcon width={24} height={24} className="text-success shrink-0" />
      ) : (
        <ClipIcon width={24} height={24} className="text-muted shrink-0" />
      )}
    </button>
  );
}
