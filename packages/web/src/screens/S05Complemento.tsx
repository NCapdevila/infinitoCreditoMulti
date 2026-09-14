import { Button } from '../components/Button.tsx';
import { SelectField } from '../components/Field.tsx';
import { DataList, DataRow } from '../components/DataList.tsx';
import { Screen } from '../components/Screen.tsx';
import { DocumentIcon, MailIcon, PersonIcon, PhoneIcon } from '../components/icons.tsx';
import {
  CONDICIONES_FISCALES,
  SEXOS,
  type DatosAsegurado,
} from '../lib/contratacion.ts';
import { completos } from '../lib/obligatorios.ts';

/**
 * S05 · «Datos del asegurado», complemento.
 *
 * Muestra lo ya cargado en una card de solo lectura y suma sexo y condición
 * fiscal.
 *
 * Los catálogos de ambos selects están pendientes de confirmar (spec 7.4): los
 * valores de `contratacion.ts` son provisorios. Condición fiscal se dibuja como
 * input en el prototipo pero se comporta como select.
 */
interface Props {
  readonly valores: DatosAsegurado;
  readonly onChange: (valores: DatosAsegurado) => void;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

export function S05Complemento({ valores, onChange, onNext, onBack }: Props) {
  const set = <K extends keyof DatosAsegurado>(campo: K, valor: DatosAsegurado[K]) =>
    onChange({ ...valores, [campo]: valor });

  const identificacion = valores.tipoPersona === 'JURIDICA' ? valores.cuit : valores.dni;

  return (
    <Screen
      volverEnAcciones
      ancho="campo"
      onBack={onBack}
      title="Datos del asegurado"
      subtitle="Conseguiste el mejor seguro para tu auto"
      actions={
        <Button onClick={onNext} disabled={!completos(valores, ['sexo', 'condicionFiscal'])}>
          Siguiente
        </Button>
      }
    >
      <div className="mt-8 flex flex-col gap-6">
        <div className="bg-surface rounded-field border border-black/5 px-4">
          <DataList>
            <DataRow icon={PersonIcon}>{valores.nombreCompleto || '—'}</DataRow>
            <DataRow icon={PhoneIcon}>{valores.telefono || '—'}</DataRow>
            <DataRow icon={MailIcon}>{valores.email || '—'}</DataRow>
            <DataRow icon={DocumentIcon}>{identificacion || '—'}</DataRow>
          </DataList>
        </div>

        <SelectField
          id="asegurado-sexo"
          label="Sexo"
          placeholder="Femenino, masculino.."
          options={SEXOS}
          value={valores.sexo}
          onChange={(e) => set('sexo', e.target.value)}
        />
        <SelectField
          id="asegurado-condicion-fiscal"
          label="Condición fiscal"
          placeholder="Consumidor final, responsable.."
          options={CONDICIONES_FISCALES}
          value={valores.condicionFiscal}
          onChange={(e) => set('condicionFiscal', e.target.value)}
        />
      </div>
    </Screen>
  );
}
