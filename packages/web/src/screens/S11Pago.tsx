import { AccordionChoice, type ChoiceItem } from '../components/AccordionChoice.tsx';
import { Button } from '../components/Button.tsx';
import { SelectField, TextField } from '../components/Field.tsx';
import { Screen } from '../components/Screen.tsx';
import {
  MARCAS_TARJETA,
  TIPOS_CUENTA,
  type MedioDePago,
  type MedioDePagoTipo,
} from '../lib/contratacion.ts';
import { completos } from '../lib/obligatorios.ts';

/**
 * S11 · «Ingresá el medio de pago».
 *
 * Tarjeta y CBU son excluyentes. Las validaciones fuertes —Luhn para la
 * tarjeta, 22 dígitos y verificadores para el CBU— van en el BFF antes de
 * emitir; acá se limita el formato de entrada para que el dato llegue limpio.
 *
 * Los campos declaran `autocomplete="cc-*"` para que el navegador ofrezca la
 * tarjeta guardada del usuario. Sobre HTTP, Chrome deshabilita ese autofill y
 * superpone un aviso propio; sobre HTTPS —como va a correr en producción— no
 * aparece. Para verlo igual en desarrollo: `HTTPS=1 npm run dev`.
 */
interface Props {
  readonly valores: MedioDePago;
  readonly onChange: (valores: MedioDePago) => void;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

/** Agrupa de a cuatro, como se lee una tarjeta. */
const formatearTarjeta = (valor: string) =>
  valor
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1-');

const formatearVencimiento = (valor: string) => {
  const d = valor.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
};

export function S11Pago({ valores, onChange, onNext, onBack }: Props) {
  const set = <K extends keyof MedioDePago>(campo: K, valor: MedioDePago[K]) =>
    onChange({ ...valores, [campo]: valor });

  // Sin el medio de pago completo la compañía no puede debitar: va todo.
  const requeridos: readonly (keyof MedioDePago)[] =
    valores.tipo === 'TARJETA'
      ? ['banco', 'marcaTarjeta', 'numero', 'vencimiento', 'titular', 'titularDni']
      : ['banco', 'cbu', 'tipoCuenta', 'titular', 'titularDni'];
  const listo = valores.tipo !== null && completos(valores, requeridos);

  const titular = (
    <>
      <TextField
        id="pago-titular"
        label="Nombre del titular"
        placeholder="Roberto Pérez"
        autoComplete="cc-name"
        value={valores.titular}
        onChange={(e) => set('titular', e.target.value)}
      />
      <TextField
        id="pago-titular-dni"
        label="DNI"
        inputMode="numeric"
        placeholder="36555668"
        value={valores.titularDni}
        onChange={(e) => set('titularDni', e.target.value.replace(/\D/g, '').slice(0, 8))}
      />
    </>
  );

  const items: ChoiceItem[] = [
    {
      value: 'TARJETA',
      label: 'Tarjeta de crédito',
      content: (
        <>
          <TextField
            id="pago-banco"
            label="Banco"
            placeholder="Banco Santa Fe"
            value={valores.banco}
            onChange={(e) => set('banco', e.target.value)}
          />
          <SelectField
            id="pago-marca"
            label="Tarjeta"
            placeholder="VISA, MASTERCARD…"
            options={MARCAS_TARJETA}
            value={valores.marcaTarjeta}
            onChange={(e) => set('marcaTarjeta', e.target.value)}
          />
          <TextField
            id="pago-numero"
            label="Número"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="4545-0000-0300-5454"
            value={valores.numero}
            onChange={(e) => set('numero', formatearTarjeta(e.target.value))}
          />
          <TextField
            id="pago-vencimiento"
            label="Vto."
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="02/28"
            value={valores.vencimiento}
            onChange={(e) => set('vencimiento', formatearVencimiento(e.target.value))}
          />
          {titular}
        </>
      ),
    },
    {
      value: 'CBU',
      label: 'CBU',
      content: (
        <>
          <TextField
            id="pago-banco-cbu"
            label="Banco"
            placeholder="Ej: Banco Santa Fe"
            value={valores.banco}
            onChange={(e) => set('banco', e.target.value)}
          />
          {/* El CBU argentino tiene 22 dígitos; el prototipo mostraba 16 en el
              placeholder, que era un error del mockup. */}
          <TextField
            id="pago-cbu"
            label="Número de CBU"
            inputMode="numeric"
            placeholder="0170099220000067797470"
            value={valores.cbu}
            onChange={(e) => set('cbu', e.target.value.replace(/\D/g, '').slice(0, 22))}
          />
          <SelectField
            id="pago-tipo-cuenta"
            label="Tipo de cuenta"
            placeholder="Caja de ahorro, cuenta corriente…"
            options={TIPOS_CUENTA}
            value={valores.tipoCuenta}
            onChange={(e) => set('tipoCuenta', e.target.value)}
          />
          {titular}
        </>
      ),
    },
  ];

  return (
    <Screen
      volverEnAcciones
      ancho="formulario"
      onBack={onBack}
      title="Ingresá el medio de pago"
      subtitle="*Se excluyen las billeteras virtuales."
      actions={
        valores.tipo !== null ? (
          <Button onClick={onNext} disabled={!listo}>
            Siguiente
          </Button>
        ) : null
      }
    >
      <div className="mt-8">
        <AccordionChoice
          label="Medio de pago"
          items={items}
          selected={valores.tipo}
          onSelect={(value) => set('tipo', value as MedioDePagoTipo | null)}
        />
      </div>
    </Screen>
  );
}
