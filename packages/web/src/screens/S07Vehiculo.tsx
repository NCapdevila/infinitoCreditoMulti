import { Button } from '../components/Button.tsx';
import { ContextCard } from '../components/DataList.tsx';
import { TextField } from '../components/Field.tsx';
import { Screen } from '../components/Screen.tsx';
import { CarIcon } from '../components/icons.tsx';
import type { DatosVehiculo } from '../lib/contratacion.ts';
import { completos } from '../lib/obligatorios.ts';

/**
 * S07 · «Contanos más sobre tu auto».
 *
 * Identificación registral. La card de arriba viene de la cotización y no se
 * edita: cambiar el vehículo obliga a recotizar.
 */
interface Props {
  readonly valores: DatosVehiculo;
  readonly onChange: (valores: DatosVehiculo) => void;
  readonly onNext: () => void;
  readonly onCeroKm: () => void;
  readonly onBack: () => void;
}

export function S07Vehiculo({ valores, onChange, onNext, onCeroKm, onBack }: Props) {
  const set = <K extends keyof DatosVehiculo>(campo: K, valor: DatosVehiculo[K]) =>
    onChange({ ...valores, [campo]: valor });

  return (
    <Screen
      volverEnAcciones
      ancho="formulario"
      onBack={onBack}
      title="Contanos más sobre tu auto"
      actions={
        <>
          <Button
            onClick={onNext}
            disabled={!completos(valores, ['patente', 'motor', 'chasis'])}
          >
            Siguiente
          </Button>
          <Button variant="secondary" onClick={onCeroKm}>
            Si es cero KM, hacé click acá
          </Button>
        </>
      }
    >
      <div className="mt-8 flex flex-col gap-6">
        <ContextCard
          icon={CarIcon}
          title={`${valores.marca} ${valores.modelo} ${valores.anio}`}
          detail={valores.version}
        />

        <TextField
          id="vehiculo-patente"
          label="Patente"
          placeholder="AZ456CD"
          editable
          maxLength={7}
          value={valores.patente}
          onChange={(e) => set('patente', e.target.value.toUpperCase())}
          className="uppercase"
        />
        <TextField
          id="vehiculo-motor"
          label="Motor"
          placeholder="10JBED0123456"
          editable
          value={valores.motor}
          onChange={(e) => set('motor', e.target.value.toUpperCase())}
        />
        <TextField
          id="vehiculo-chasis"
          label="Nº de chasis"
          placeholder="8AEJKLCEG123456"
          editable
          value={valores.chasis}
          onChange={(e) => set('chasis', e.target.value.toUpperCase())}
        />
      </div>
    </Screen>
  );
}
