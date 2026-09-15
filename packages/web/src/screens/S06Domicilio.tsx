import { Button } from '../components/Button.tsx';
import { ContextCard } from '../components/DataList.tsx';
import { TextField } from '../components/Field.tsx';
import { Screen } from '../components/Screen.tsx';
import { MailboxIcon } from '../components/icons.tsx';
import type { DomicilioVehiculo } from '../lib/contratacion.ts';
import { completos } from '../lib/obligatorios.ts';

/**
 * S06 · «¿Cuál es el domicilio de tu auto?»
 *
 * El CP y la localidad no se editan acá: los capturó el motor en el paso de
 * localidad de la etapa 2 y afectan la tarifa.
 */
interface Props {
  readonly valores: DomicilioVehiculo;
  readonly onChange: (valores: DomicilioVehiculo) => void;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

export function S06Domicilio({ valores, onChange, onNext, onBack }: Props) {
  const set = <K extends keyof DomicilioVehiculo>(campo: K, valor: DomicilioVehiculo[K]) =>
    onChange({ ...valores, [campo]: valor });

  return (
    <Screen
      volver="ambos"
      ancho="formulario"
      onBack={onBack}
      title="¿Cuál es el domicilio de tu auto?"
      actions={
        <Button onClick={onNext} disabled={!completos(valores, ['calle', 'altura'])}>
          Siguiente
        </Button>
      }
    >
      <div className="mt-8 flex flex-col gap-6">
        <ContextCard
          icon={MailboxIcon}
          title={`CP: ${valores.cp}`}
          detail={valores.localidad}
        />

        <TextField
          id="domicilio-calle"
          label="Calle"
          placeholder="Pje. Chacabuco"
          autoComplete="address-line1"
          editable
          value={valores.calle}
          onChange={(e) => set('calle', e.target.value)}
        />
        <TextField
          id="domicilio-altura"
          label="Altura"
          inputMode="numeric"
          placeholder="2486"
          editable
          value={valores.altura}
          onChange={(e) => set('altura', e.target.value)}
        />
        <TextField
          id="domicilio-piso"
          label="Piso / Depto"
          opcional
          placeholder="2° B"
          editable
          value={valores.pisoDepto}
          onChange={(e) => set('pisoDepto', e.target.value)}
        />
      </div>
    </Screen>
  );
}
