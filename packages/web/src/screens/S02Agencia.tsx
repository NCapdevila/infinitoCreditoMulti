import { Button } from '../components/Button.tsx';
import { TextField } from '../components/Field.tsx';
import { Screen } from '../components/Screen.tsx';
import type { DatosAgencia } from '../lib/contratacion.ts';
import { completos } from '../lib/obligatorios.ts';

/**
 * S02 · «Datos de la agencia».
 *
 * Primera pantalla del formulario. Los campos no llevan lápiz: no vienen
 * prellenados de la cotización.
 *
 * Sólo el nombre de la agencia es obligatorio; los datos del vendedor pueden
 * completarse después, así que no bloquean el avance.
 *
 * Bloqueante abierto: no está definido si estos datos los carga el vendedor o
 * el cliente. Si es el vendedor, la app necesita sesión.
 */
interface Props {
  readonly valores: DatosAgencia;
  readonly onChange: (valores: DatosAgencia) => void;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

export function S02Agencia({ valores, onChange, onNext, onBack }: Props) {
  const set = <K extends keyof DatosAgencia>(campo: K, valor: DatosAgencia[K]) =>
    onChange({ ...valores, [campo]: valor });

  const listo = completos(valores, ['nombre']);

  return (
    <Screen
      ancho="formulario"
      onBack={onBack}
      title="Datos de la agencia"
      subtitle="Conseguiste el mejor seguro para tu auto"
      actions={
        <Button onClick={onNext} disabled={!listo}>
          Siguiente
        </Button>
      }
    >
      <form
        className="mt-8 flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          onNext();
        }}
      >
        <TextField
          id="agencia-nombre"
          label="Agencia"
          placeholder="Nombre de la Agencia"
          autoComplete="organization"
          value={valores.nombre}
          onChange={(e) => set('nombre', e.target.value)}
        />
        <TextField
          id="agencia-vendedor"
          opcional
          label="Vendedor"
          placeholder="Juan Perez"
          autoComplete="name"
          value={valores.vendedor}
          onChange={(e) => set('vendedor', e.target.value)}
        />
        <TextField
          id="agencia-telefono"
          opcional
          label="Teléfono"
          type="tel"
          inputMode="tel"
          placeholder="0344 15405536"
          autoComplete="tel"
          value={valores.telefono}
          onChange={(e) => set('telefono', e.target.value)}
        />
        <TextField
          id="agencia-email"
          opcional
          label="E-mail"
          type="email"
          inputMode="email"
          placeholder="juanperez@gmail.com"
          autoComplete="email"
          value={valores.email}
          onChange={(e) => set('email', e.target.value)}
        />
      </form>
    </Screen>
  );
}
