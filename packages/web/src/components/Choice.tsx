import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeftIcon } from './icons.tsx';

/**
 * Selectores del cotizador.
 *
 * El motor resuelve estos pasos de tres formas distintas —grilla de logos,
 * grilla de años y listado con buscador— y las tres postean apenas se elige,
 * sin botón de confirmar. Eso se respeta acá: `onSelect` avanza.
 */

export interface Option {
  readonly value: string;
  readonly label: string;
  readonly iconUrl?: string;
}

/** Flecha de «entrar» de las filas de listado. Azul y grande, como en el motor. */
function RowArrow() {
  return <ChevronLeftIcon width={22} height={22} className="text-primary shrink-0 rotate-180" />;
}

/** Lupa del buscador. */
function LupaIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="text-ink/70 pointer-events-none absolute top-1/2 right-5 -translate-y-1/2"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.5-4.5" />
    </svg>
  );
}

interface OptionListProps {
  readonly items: readonly Option[];
  readonly onSelect: (value: string) => void;
  /** Con más de una docena de ítems conviene buscador; el motor lo pone siempre. */
  readonly searchPlaceholder?: string;
  readonly emptyLabel?: string;
}

/**
 * Listado con buscador. Filtra en el cliente, como hace el multicotizador:
 * el motor manda la lista entera (831 localidades en el caso extremo).
 */
export function OptionList({
  items,
  onSelect,
  searchPlaceholder,
  emptyLabel = 'No encontramos resultados',
}: OptionListProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();
    if (term === '') return items;
    return items.filter((i) => i.label.toLowerCase().includes(term));
  }, [items, query]);

  return (
    <div className="mx-auto flex w-full flex-col gap-4 md:max-w-(--w-campo)">
      {searchPlaceholder !== undefined && (
        <div className="relative">
          <input
            id="buscador"
            type="search"
            value={query}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Con un solo resultado, Enter lo elige: el multi hace lo mismo y
              // ahorra un toque en listas largas.
              const unico = filtered[0];
              if (e.key === 'Enter' && filtered.length === 1 && unico !== undefined) {
                e.preventDefault();
                onSelect(unico.value);
              }
            }}
            className="border-line text-ink placeholder:text-placeholder focus:border-primary h-16 w-full rounded-[28px] border bg-white pr-14 pl-6 text-base focus:outline-none"
          />
          <LupaIcon />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-muted py-8 text-center text-sm">{emptyLabel}</p>
      ) : (
        <>
          {/*
            Altura acotada con scroll propio, como hace el motor. Sin esto, la
            lista de localidades —831 entradas— genera una página de más de cien
            mil píxeles de alto: imposible de recorrer y pesada de renderizar.
          */}
          <ul className="flex max-h-[300px] flex-col overflow-y-auto md:max-h-[420px]">
            {filtered.map((item) => (
              <li key={item.value}>
                <button
                  type="button"
                  onClick={() => onSelect(item.value)}
                  className="hover:bg-primary/15 flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left transition-colors"
                >
                  {/* El motor muestra estos listados en mayúsculas y en gris. */}
                  <span className="text-muted flex-1 text-base tracking-wide uppercase">
                    {item.label}
                  </span>
                  <RowArrow />
                </button>
              </li>
            ))}
          </ul>

          {/* Con listas largas conviene decir cuántas hay y que se puede buscar. */}
          {filtered.length > 12 && (
            <p className="text-muted/70 text-center text-xs">
              {filtered.length} opciones · buscá para filtrar
            </p>
          )}
        </>
      )}
    </div>
  );
}

interface CardGridProps {
  readonly items: readonly Option[];
  readonly onSelect: (value: string) => void;
  /** 2 columnas para logos, 3 para años. */
  readonly columns?: 2 | 3;
}

/**
 * Grilla de tarjetas: marcas destacadas (con logo) y años.
 *
 * En escritorio el motor las pone en 5 columnas y agranda las tarjetas — con 2
 * columnas estiradas la pantalla se ve como un mobile ampliado.
 */
export function CardGrid({ items, onSelect, columns = 2 }: CardGridProps) {
  return (
    // El motor usa dos columnas en mobile tanto para marcas como para años, y
    // pasa a cinco en escritorio.
    <div className={`grid grid-cols-2 gap-4 ${columns === 3 ? 'md:grid-cols-6' : 'md:grid-cols-5'}`}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => onSelect(item.value)}
          // Sin borde y con sombra suave: así se ven en el motor. El borde las
          // hacía parecer campos de formulario en vez de tarjetas.
          className="flex h-32 flex-col items-center justify-center gap-1 rounded-xl bg-white p-3 shadow-[0_2px_10px_rgba(0,0,0,0.10)] transition-shadow hover:shadow-[0_4px_18px_rgba(51,121,246,0.22)] md:h-36"
        >
          {item.iconUrl !== undefined ? (
            <img
              src={item.iconUrl}
              alt={item.label}
              className="max-h-20 max-w-[78%] object-contain"
            />
          ) : (
            <span className="text-muted text-xl">{item.label}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Eyebrow de las pantallas del cotizador: «COMENCEMOS», «YA CASI ESTAMOS». */
export function Eyebrow({ children }: { readonly children: ReactNode }) {
  return (
    <p className="text-muted mt-8 text-center text-xs tracking-[0.18em] uppercase">{children}</p>
  );
}
