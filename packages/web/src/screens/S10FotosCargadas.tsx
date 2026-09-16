import { Button } from '../components/Button.tsx';
import { DocumentIcon } from '../components/icons.tsx';
import { Screen } from '../components/Screen.tsx';
import { TOMAS, type FotoCargada } from '../lib/contratacion.ts';
import { abrirPdf, esPdf } from '../lib/imagenes.ts';

/**
 * S10 · «Fotos cargadas».
 *
 * Última revisión antes de seguir. Las etiquetas salen del mismo enum que el
 * checklist, así que no pueden discrepar como discrepaban en el prototipo.
 */
interface Props {
  readonly fotos: readonly FotoCargada[];
  readonly onNext: () => void;
  readonly onRehacer: () => void;
  readonly onBack: () => void;
}

export function S10FotosCargadas({ fotos, onNext, onRehacer, onBack }: Props) {
  const enOrden = TOMAS.map((t) => ({
    label: t.label,
    foto: fotos.find((f) => f.tipo === t.tipo),
  })).filter((x) => x.foto !== undefined);

  return (
    <Screen
      ancho="fotos"
      onBack={onBack}
      title="Fotos cargadas"
      actions={
        <>
          <Button onClick={onNext}>Siguiente</Button>
          <Button variant="secondary" onClick={onRehacer}>
            Volver a tomar fotos
          </Button>
        </>
      }
    >
      <div className="mt-8 grid grid-cols-2 gap-3 md:mt-10 md:grid-cols-3 md:gap-6">
        {enOrden.map(({ label, foto }) => (
          <figure key={label} className="bg-surface relative overflow-hidden rounded-md">
            {foto !== undefined && esPdf(foto.previewUrl) ? (
              /*
                Un PDF no entra en un <img>. Y aunque se dibujara la primera
                página, a este tamaño una cédula no se lee: lo útil es saber qué
                archivo se cargó y poder abrirlo entero para revisarlo.
              */
              <button
                type="button"
                onClick={() => abrirPdf(foto.previewUrl)}
                aria-label={`Ver ${label} (PDF)`}
                className="text-muted hover:text-primary flex aspect-4/3 w-full flex-col items-center justify-center gap-1.5 px-3 pb-7 transition-colors"
              >
                <DocumentIcon width={40} height={40} />
                <span className="max-w-full truncate text-xs">{foto.nombreArchivo}</span>
                <span className="text-primary text-xs font-semibold">Ver PDF</span>
              </button>
            ) : (
              <img src={foto?.previewUrl} alt={label} className="aspect-4/3 w-full object-cover" />
            )}
            <figcaption className="absolute bottom-0 left-0 max-w-full bg-black/55 px-2 py-1 text-xs text-white">
              {label}
            </figcaption>
          </figure>
        ))}
      </div>
    </Screen>
  );
}
