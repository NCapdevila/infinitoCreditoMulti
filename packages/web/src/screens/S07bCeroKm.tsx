import { Button } from '../components/Button.tsx';
import { Screen } from '../components/Screen.tsx';
import { AdjuntoCompacto } from '../components/Upload.tsx';

/**
 * S07b · «Si el auto es 0 KM».
 *
 * Reemplaza la identificación registral por el certificado de no rodamiento.
 *
 * BLOQUEANTE ABIERTO (spec 7.3): en el prototipo esta rama **saltea las nueve
 * fotos** y cae directo en el medio de pago. Es la decisión de mayor impacto
 * del flujo — si un 0 KM se emite sin inspección, cambia el modelo de datos y
 * probablemente el acuerdo con la compañía. Acá se respeta el prototipo; el
 * destino se decide en el router, no en esta pantalla.
 */
interface Props {
  readonly nombreArchivo: string | null;
  readonly onArchivo: (nombreArchivo: string) => void;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

const REQUISITOS = ['Fecha del día', 'Firma', 'Sello'];

export function S07bCeroKm({ nombreArchivo, onArchivo, onNext, onBack }: Props) {
  return (
    <Screen
      volver="ambos"
      ancho="angosto"
      onBack={onBack}
      title="Si el auto es 0 KM"
      subtitle="*Tener en cuenta los requisitos"
      actions={
        <Button onClick={onNext} disabled={nombreArchivo === null}>
          Siguiente
        </Button>
      }
    >
      <div className="mt-8 flex flex-col gap-6 md:mt-12 md:flex-row md:items-start md:justify-between md:gap-12">
        <div className="md:flex-1">
          <AdjuntoCompacto
          label="Adjuntar documento de no rodamiento"
          nombreArchivo={nombreArchivo}
            onFile={(file) => onArchivo(file.name)}
          />
        </div>

        <div>
          <p className="text-ink text-sm font-semibold">Requisitos:</p>
          <ul className="text-muted mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
            {REQUISITOS.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </div>
    </Screen>
  );
}
