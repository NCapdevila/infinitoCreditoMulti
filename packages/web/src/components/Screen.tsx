import type { ReactNode } from 'react';
import { Button } from './Button.tsx';
import { ChevronLeftIcon, LogoInfinito } from './icons.tsx';

/**
 * C1 · Header, y el armazón que comparten todas las pantallas.
 *
 * En mobile es la columna de 390 px del Figma. En escritorio sigue lo que el
 * motor ya hace en producción: el contenedor se ensancha, el título salta a
 * 40 px y los botones se ponen en fila en vez de apilarse a lo ancho —dejar un
 * botón de 1000 px de ancho es lo que hacía ver la pantalla como un mobile
 * estirado.
 *
 * El contenido va en un bloque angosto y centrado (`ancho`), que es lo que
 * mantiene legible la lectura en pantallas grandes.
 */

/** Ancho del bloque de contenido en escritorio, según lo que contenga. */
export type AnchoContenido = 'campo' | 'formulario' | 'angosto' | 'fotos' | 'completo';

const ANCHOS: Record<AnchoContenido, string> = {
  // Inputs sueltos, cards y listas de resumen.
  campo: 'md:max-w-(--w-campo) lg:max-w-(--w-campo-lg)',
  // Formularios de varios campos y acordeones.
  formulario: 'md:max-w-(--w-formulario)',
  // Un solo control: adjuntos, un campo aislado.
  angosto: 'md:max-w-(--w-angosto)',
  // Grillas de fotos.
  fotos: 'md:max-w-(--w-fotos)',
  // Sin límite: grillas de marcas y resultados usan todo el contenedor.
  completo: '',
};

interface ScreenProps {
  readonly title?: ReactNode;
  /** Bajada violeta, como en las pantallas de la contratación. */
  readonly subtitle?: ReactNode;
  /** Bajada gris del cotizador; usa el ancho del contenedor, no el del contenido. */
  readonly description?: ReactNode;
  /** Aclaración corta en violeta: «*Influye en el precio». */
  readonly nota?: ReactNode;
  readonly eyebrow?: ReactNode;
  /** Sin handler no se muestra el botón: la primera pantalla no vuelve atrás. */
  readonly onBack?: () => void;
  /** El header se atenúa detrás de un modal. */
  readonly dimmed?: boolean;
  readonly children?: ReactNode;
  /** Botonera al pie; en escritorio se acomoda en fila. */
  readonly actions?: ReactNode;
  /** Qué tan ancho puede ser el contenido en escritorio. */
  readonly ancho?: AnchoContenido;
  /** El logo vuelve al inicio. Sin handler, el logo no es clickeable. */
  readonly onInicio?: () => void;
  /**
   * Suma un botón «Volver» junto a las acciones.
   *
   * En el formulario de contratación el chevron del header queda lejos de donde
   * está la vista —sobre todo en escritorio—, así que el paso atrás se ofrece
   * también al pie, al lado del que avanza.
   */
  readonly volverEnAcciones?: boolean;
}

export function Screen({
  title,
  subtitle,
  description,
  nota,
  eyebrow,
  onBack,
  dimmed,
  children,
  actions,
  ancho = 'campo',
  onInicio,
  volverEnAcciones,
}: ScreenProps) {
  const mostrarVolver = volverEnAcciones === true && onBack !== undefined;

  /**
   * El logo vuelve al inicio.
   *
   * Reiniciar en medio de la carga tira a la basura todo lo que el vendedor
   * completó, así que a partir de la segunda pantalla se pregunta primero. En
   * la primera no hay nada que perder y se va directo.
   */
  const volverAlInicio = () => {
    if (onInicio !== undefined) {
      onInicio();
      return;
    }
    const empezado = onBack !== undefined;
    if (empezado && !window.confirm('¿Volver al inicio? Se pierde lo que cargaste.')) return;
    window.location.href = '/';
  };

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header
        // Los 112 px del Figma dejaban demasiado aire alrededor del logo. El
        // header ahora se ajusta a lo que contiene: el logo lo llena.
        className={`flex h-[80px] shrink-0 items-center border-b border-black/5 px-gutter transition-opacity md:h-[80px] ${
          dimmed === true ? 'opacity-40' : ''
        }`}
      >
        <div className="w-10">
          {onBack !== undefined && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Volver al paso anterior"
              className="bg-surface flex size-10 items-center justify-center rounded-full text-white"
            >
              <ChevronLeftIcon width={20} height={20} />
            </button>
          )}
        </div>
        <div className="flex flex-1 justify-center pr-10">
          <button
            type="button"
            onClick={volverAlInicio}
            aria-label="Volver al inicio"
            className="rounded focus-visible:outline-offset-4"
          >
            <LogoInfinito />
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-(--container-app) flex-1 flex-col px-gutter pb-10 md:max-w-(--container-app-md) lg:max-w-(--container-app-lg)">
        {eyebrow !== undefined && (
          <p className="text-muted mt-8 text-center text-xs tracking-[0.18em] uppercase md:text-sm">
            {eyebrow}
          </p>
        )}

        {title !== undefined && (
          <h1 className="text-primary mt-3 text-center text-[26px] leading-tight font-semibold text-balance md:mt-4 md:text-[40px]">
            {title}
          </h1>
        )}
        {subtitle !== undefined && (
          <p className="text-accent mx-auto mt-2 text-center text-sm text-balance md:mt-3 md:max-w-(--w-formulario) md:text-base">
            {subtitle}
          </p>
        )}
        {description !== undefined && (
          <p className="text-muted mx-auto mt-3 text-center text-sm text-balance md:text-xl">
            {description}
          </p>
        )}
        {nota !== undefined && (
          <p className="text-accent mt-3 text-center text-sm font-medium">{nota}</p>
        )}

        {/*
          En mobile el contenido se estira y empuja los botones al pie, como en
          el Figma. En escritorio no: los botones van justo debajo del
          contenido, que es donde los pone el motor.
        */}
        <div className={`mx-auto w-full flex-1 md:flex-none ${ANCHOS[ancho]}`}>{children}</div>

        {(actions !== undefined || mostrarVolver) && (
          <div className="mx-auto mt-8 flex w-full flex-col gap-3 md:mt-12 md:max-w-(--w-formulario) md:flex-row md:justify-center md:gap-4 [&>*]:md:max-w-(--w-boton)">
            {actions}
            {mostrarVolver && (
              <Button variant="secondary" onClick={onBack}>
                Volver
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
