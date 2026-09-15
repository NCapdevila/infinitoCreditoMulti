import { AccordionChoice, type ChoiceItem } from '../components/AccordionChoice.tsx';
import { Button } from '../components/Button.tsx';
import { TextField } from '../components/Field.tsx';
import { Screen } from '../components/Screen.tsx';
import type { DatosAsegurado, TipoPersona } from '../lib/contratacion.ts';
import { completos } from '../lib/obligatorios.ts';

/**
 * S04 · «Datos del asegurado», selección de tipo.
 *
 * Física y jurídica son excluyentes: al abrir una, la otra se oculta. El botón
 * aparece recién cuando hay una opción elegida, como en el prototipo.
 */
interface Props {
  readonly valores: DatosAsegurado;
  readonly onChange: (valores: DatosAsegurado) => void;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

export function S04Asegurado({ valores, onChange, onNext, onBack }: Props) {
  const set = <K extends keyof DatosAsegurado>(campo: K, valor: DatosAsegurado[K]) =>
    onChange({ ...valores, [campo]: valor });

  // Una jurídica identifica con razón social y CUIT; una física, con nombre y DNI.
  const requeridos: readonly (keyof DatosAsegurado)[] =
    valores.tipoPersona === 'JURIDICA'
      ? ['nombreCompleto', 'razonSocial', 'cuit', 'email', 'telefono']
      : ['nombreCompleto', 'dni', 'email', 'telefono'];
  const listo = valores.tipoPersona !== null && completos(valores, requeridos);

  const comunes = (
    <>
      <TextField
        id="asegurado-email"
        label="E-mail"
        type="email"
        inputMode="email"
        placeholder="juanpablog@gmail.com"
        autoComplete="email"
        editable
        value={valores.email}
        onChange={(e) => set('email', e.target.value)}
      />
      <TextField
        id="asegurado-telefono"
        label="Teléfono"
        type="tel"
        inputMode="tel"
        placeholder="+541123456789"
        autoComplete="tel"
        editable
        value={valores.telefono}
        onChange={(e) => set('telefono', e.target.value)}
      />
    </>
  );

  const items: ChoiceItem[] = [
    {
      value: 'FISICA',
      label: 'Persona Física',
      content: (
        <>
          <TextField
            id="asegurado-nombre"
            label="Nombre completo"
            placeholder="Juan Pablo Gomez"
            autoComplete="name"
            editable
            value={valores.nombreCompleto}
            onChange={(e) => set('nombreCompleto', e.target.value)}
          />
          <TextField
            id="asegurado-dni"
            label="DNI"
            inputMode="numeric"
            placeholder="36555668"
            editable
            value={valores.dni}
            onChange={(e) => set('dni', e.target.value)}
          />
          {comunes}
        </>
      ),
    },
    {
      value: 'JURIDICA',
      label: 'Persona Jurídica',
      content: (
        <>
          {/* La spec lo marca como el contacto, no la empresa (ambigüedad 7 del relevamiento). */}
          <TextField
            id="asegurado-contacto"
            label="Nombre completo"
            placeholder="Juan Pablo Gomez"
            autoComplete="name"
            editable
            value={valores.nombreCompleto}
            onChange={(e) => set('nombreCompleto', e.target.value)}
          />
          <TextField
            id="asegurado-razon-social"
            label="Razón Social"
            placeholder="FCA AUTOMOBILES ARGENTINA S.A."
            autoComplete="organization"
            editable
            value={valores.razonSocial}
            onChange={(e) => set('razonSocial', e.target.value)}
          />
          <TextField
            id="asegurado-cuit"
            label="CUIT"
            inputMode="numeric"
            placeholder="30385563459"
            editable
            value={valores.cuit}
            onChange={(e) => set('cuit', e.target.value)}
          />
          {comunes}
        </>
      ),
    },
  ];

  return (
    <Screen
      ancho="formulario"
      onBack={onBack}
      title="Datos del asegurado"
      subtitle="Conseguiste el mejor seguro para tu auto"
      actions={
        valores.tipoPersona !== null ? (
          <Button onClick={onNext} disabled={!listo}>
            Siguiente
          </Button>
        ) : null
      }
    >
      <div className="mt-8">
        <AccordionChoice
          label="Tipo de persona"
          items={items}
          selected={valores.tipoPersona}
          onSelect={(value) => set('tipoPersona', value as TipoPersona | null)}
        />
      </div>
    </Screen>
  );
}
