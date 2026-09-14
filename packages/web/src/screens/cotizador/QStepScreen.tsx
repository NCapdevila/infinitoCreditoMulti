import { useEffect, useState } from 'react';
import type { ChoiceOption, Step } from '@infinito/bff/motor/types';
import { Button } from '../../components/Button.tsx';
import { CardGrid, OptionList } from '../../components/Choice.tsx';
import { Screen } from '../../components/Screen.tsx';

/**
 * Una pantalla del cotizador, renderizada desde el `Step` que normaliza el BFF.
 *
 * Todo lo específico de cada paso —qué campos pide, de qué tipo, si la lista
 * viene incluida o hay que pedirla— llega en el `Step`. Esta pantalla no sabe
 * cuál está mostrando.
 */
interface Props {
  readonly step: Step;
  readonly onSubmit: (valores: Record<string, string>) => void;
  /** Salidas alternativas: «Cotizar sin patente», «Otra marca». */
  readonly onAction?: (stepId: string) => void;
  readonly onBack?: () => void;
  /** Opciones ya traídas del catálogo, para los pasos con buscador. */
  readonly opciones?: readonly ChoiceOption[];
  readonly cargandoOpciones?: boolean;
  readonly enviando?: boolean;
  /** Falla al enviar el paso; se muestra sin sacar al usuario de la pantalla. */
  readonly error?: string | null;
}

/** El teclado móvil correcto según el tipo que declara el motor. */
function modoDeEntrada(type: string, name: string): 'numeric' | 'email' | 'tel' | undefined {
  if (type === 'email') return 'email';
  if (type === 'tel' || name.startsWith('phone')) return 'tel';
  if (type === 'number') return 'numeric';
  return undefined;
}

const ETIQUETAS_DE_BUSQUEDA: Record<string, string> = {
  model: 'Buscar por modelo',
  version: 'Buscar por versión',
  province: 'Buscar por provincia',
  locality: 'Buscar por localidad o código postal',
  brand: 'Buscar por marca',
};

export function QStepScreen({
  step,
  onSubmit,
  onAction,
  onBack,
  opciones,
  cargandoOpciones,
  enviando,
  error,
}: Props) {
  /** Un valor por campo: el paso del celular trae tres. */
  const [valores, setValores] = useState<Record<string, string>>({});

  // Algunos campos llegan con valor del motor (la fecha de nacimiento, el
  // prefijo telefónico): se respetan como punto de partida.
  useEffect(() => {
    if (step.kind !== 'text-input') return;
    const iniciales: Record<string, string> = {};
    for (const campo of step.fields) {
      if (campo.value !== undefined) iniciales[campo.name] = campo.value;
    }
    setValores(iniciales);
  }, [step]);

  if (step.kind === 'waiting') return null;

  // Pantalla informativa: muestra lo que el motor encontró y ofrece seguir.
  // No pide datos, así que todo su avance son acciones.
  if (step.kind === 'info') {
    return (
      <Screen
        onBack={onBack}
        eyebrow={step.eyebrow}
        title={step.title}
        ancho="campo"
        actions={step.actions.map((accion, i) => (
          <Button
            key={accion.step}
            variant={i === 0 ? 'primary' : 'secondary'}
            onClick={() => onAction?.(accion.step)}
            disabled={enviando === true}
          >
            {accion.label}
          </Button>
        ))}
      >
        {step.detalle.length > 0 && (
          <div className="bg-surface rounded-field mt-8 flex flex-col gap-2 p-5 text-center md:mt-12 md:p-8">
            {step.detalle.map((linea, i) => (
              <p
                key={linea}
                className={
                  i === 0
                    ? 'text-ink text-base font-semibold md:text-xl'
                    : 'text-muted text-sm md:text-base'
                }
              >
                {linea}
              </p>
            ))}
          </div>
        )}

        {error !== null && error !== undefined && (
          <p role="alert" className="mt-4 text-center text-sm text-red-600">
            {error}
          </p>
        )}
      </Screen>
    );
  }

  const completo =
    step.kind !== 'text-input' ||
    step.fields.every((campo) => (valores[campo.name] ?? '').trim() !== '');

  const enviar = () => {
    if (step.kind !== 'text-input' || !completo || enviando === true) return;
    onSubmit(valores);
  };

  /*
   * En los pasos de lista no hay botón de avance —se elige tocando una opción—,
   * así que la salida alternativa («Otra marca», «Anterior al 2006») queda como
   * el único botón de la pantalla y va en primario, igual que en el motor. Donde
   * sí hay un botón que avanza, la alternativa es secundaria.
   */
  const hayBotonPrincipal = step.kind === 'text-input';

  const acciones = (
    <>
      {step.kind === 'text-input' && (
        <Button onClick={enviar} disabled={!completo || enviando === true}>
          {enviando === true ? 'Enviando…' : (step.submit.label ?? 'Siguiente')}
        </Button>
      )}
      {step.actions.map((accion) => (
        <Button
          key={accion.step}
          variant={hayBotonPrincipal ? 'secondary' : 'primary'}
          onClick={() => onAction?.(accion.step)}
          disabled={enviando === true}
        >
          {accion.label}
        </Button>
      ))}
    </>
  );

  const listado = step.kind === 'choice' ? (opciones ?? step.options) : [];

  // Un campo suelto se queda angosto y centrado; las grillas usan todo el ancho.
  const ancho = step.kind === 'text-input' ? 'angosto' : 'completo';

  return (
    <Screen
      onBack={onBack}
      eyebrow={step.eyebrow}
      title={step.title}
      description={step.description}
      nota={step.nota}
      ancho={ancho}
      actions={acciones}
    >
      {error !== null && error !== undefined && (
        <p role="alert" className="mt-4 text-center text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-8 md:mt-16">
        {step.kind === 'text-input' ? (
          <div className={step.fields.length > 1 ? 'flex gap-2' : 'flex flex-col gap-4'}>
            {step.fields.map((campo, i) => (
              <input
                key={campo.name}
                id={campo.name}
                type={campo.type}
                inputMode={modoDeEntrada(campo.type, campo.name)}
                placeholder={campo.placeholder}
                maxLength={campo.maxLength}
                aria-label={campo.label ?? step.title}
                value={valores[campo.name] ?? ''}
                onChange={(e) =>
                  setValores((previo) => ({
                    ...previo,
                    [campo.name]:
                      campo.name === 'plate' ? e.target.value.toUpperCase() : e.target.value,
                  }))
                }
                onKeyDown={(e) => e.key === 'Enter' && enviar()}
                className={`h-12 rounded-field border-line text-ink placeholder:text-placeholder focus:border-primary border px-4 text-base focus:outline-none ${
                  // El celular son tres campos de anchos distintos: prefijo y
                  // característica cortos, el número ocupa el resto.
                  step.fields.length > 1 ? (i < 2 ? 'w-20 text-center' : 'flex-1') : 'w-full'
                } ${
                  campo.name === 'plate'
                    ? 'placeholder:normal-case text-center tracking-[0.2em] uppercase placeholder:tracking-normal'
                    : ''
                }`}
              />
            ))}
          </div>
        ) : cargandoOpciones === true ? (
          <p className="text-muted py-10 text-center text-sm">Buscando opciones…</p>
        ) : step.searchable ? (
          <OptionList
            items={listado}
            onSelect={(value) => onSubmit({ [step.name]: value })}
            searchPlaceholder={ETIQUETAS_DE_BUSQUEDA[step.name] ?? 'Buscar'}
          />
        ) : (
          <CardGrid
            items={listado}
            onSelect={(value) => onSubmit({ [step.name]: value })}
            columns={step.name === 'year' ? 3 : 2}
          />
        )}
      </div>
    </Screen>
  );
}
