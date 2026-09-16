import type { ReactNode } from 'react';
import { Button } from './Button.tsx';
import { LogoInfinito } from './icons.tsx';
import { ID_SCROLL } from '../lib/scroll.ts';

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
 *
 * El armazón está clavado al alto de la ventana y sólo scrollea el medio: ver
 * [`lib/scroll.ts`](../lib/scroll.ts), que es también de donde sale el
 * `irArriba` que usa el router.
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
}: ScreenProps) {
  /*
    El paso atrás tiene un solo lugar: un botón al pie, al lado del que avanza.
    Hubo un chevron arriba a la izquierda —como el del motor—, pero convivía con
    este botón en toda la contratación: dos formas de lo mismo, y la de arriba
    lejos de donde está la vista.
  */
  const mostrarVolver = onBack !== undefined;

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

  const botonera = (actions !== undefined || mostrarVolver) && (
    <div className="mx-auto flex w-full flex-col gap-3 md:max-w-(--w-formulario) md:flex-row md:justify-center md:gap-4 [&>*]:md:max-w-(--w-boton)">
      {actions}
      {/*
        «Volver» va siempre último, después de todas las acciones de la pantalla:
        a la derecha en escritorio, donde la botonera es una fila, y abajo de
        todo en mobile, donde se apila. Ninguna pantalla lo escribe a mano —lo
        pone sólo este componente—, y eso es lo que garantiza el orden.
      */}
      {mostrarVolver && (
        <Button variant="secondary" onClick={onBack}>
          Volver
        </Button>
      )}
    </div>
  );

  /*
    El armazón está clavado al alto de la ventana: el header queda fijo arriba y
    todo lo demás —contenido y botonera— scrollea debajo. El documento no crece,
    así que embebida la página de la agencia deja de crecer con la pantalla más
    larga del cotizador y de sobrarle aire en la más corta.

    Lo que scrollea es el contenido, no el lugar de la botonera: va pegada a lo
    último que haya, sin importar cuánto mida la pantalla ni el `height` que le
    ponga la agencia al iframe.
  */
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white">
      <header
        // Los 112 px del Figma dejaban demasiado aire alrededor del logo. El
        // header ahora se ajusta a lo que contiene: el logo lo llena.
        className={`flex h-[80px] shrink-0 items-center border-b border-black/5 px-gutter transition-opacity md:h-[80px] ${
          dimmed === true ? 'opacity-40' : ''
        }`}
      >
        {/* Sin chevron a la izquierda, el logo se centra solo. */}
        <div className="flex flex-1 justify-center">
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

      {/*
        Acá vive el scroll, y no en el documento. `min-h-0` es lo que se lo
        permite: sin eso un hijo flex no se achica por debajo de su contenido y
        el contenedor crece en vez de scrollear. `overscroll-contain` corta el
        encadenado —llegar al final del cotizador no sigue bajando la página que
        lo embebe—.
      */}
      <div id={ID_SCROLL} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <main className="mx-auto flex w-full max-w-(--container-app) flex-col px-gutter pb-10 md:max-w-(--container-app-md) lg:max-w-(--container-app-lg)">
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

          <div className={`mx-auto w-full ${ANCHOS[ancho]}`}>{children}</div>

          {/*
            La botonera va pegada al contenido, no al pie de la pantalla.

            Nada la empuja hacia abajo: ni un espaciador que crezca ni el alto
            de la ventana. En una pantalla corta queda justo debajo del último
            campo aunque sobre media pantalla; en una larga hay que scrollear
            hasta ella, como cualquier formulario. La distancia al contenido es
            siempre la misma, en el celular y en el escritorio.
          */}
          {botonera !== false && <div className="mt-8 md:mt-12">{botonera}</div>}
        </main>
      </div>
    </div>
  );
}
