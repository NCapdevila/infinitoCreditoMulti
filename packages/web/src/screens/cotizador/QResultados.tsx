import { useState } from 'react';
import type { Quotations, Quote } from '@infinito/bff/motor/quotations';
import { Button } from '../../components/Button.tsx';
import { Screen } from '../../components/Screen.tsx';
import { ChevronDownIcon, WhatsappIcon } from '../../components/icons.tsx';

/**
 * Resultados de la cotización.
 *
 * Una cobertura por acordeón y una tarjeta por plan, como el multi. Los
 * resultados llegan por olas, así que la pantalla tiene que servir tanto para
 * 5 planes como para 33 sin cambiar de forma.
 */
interface Props {
  readonly resultados: Quotations;
  /** Siguen llegando planes: el motor responde por olas. */
  readonly buscandoMas?: boolean;
  readonly onContratar: (quote: Quote) => void;
  readonly onWhatsapp?: () => void;
  readonly onBack?: () => void;
}

/**
 * Logo de la compañía, con el nombre como respaldo.
 *
 * Los logos viven en un CDN externo: si no cargan, el vendedor se queda sin
 * saber de quién es cada precio, que es el dato que más pesa en la elección.
 */
function CompanyLogo({ quote }: { quote: Quote }) {
  const [fallo, setFallo] = useState(false);

  if (quote.companyLogoUrl === undefined || fallo) {
    return <span className="text-ink text-sm font-semibold">{quote.company}</span>;
  }
  return (
    <img
      src={quote.companyLogoUrl}
      alt={quote.company}
      onError={() => setFallo(true)}
      className="h-7 max-w-28 object-contain object-left"
    />
  );
}

function QuoteCard({ quote, onContratar }: { quote: Quote; onContratar: () => void }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="rounded-field border-line/50 border bg-white p-4 md:px-6 md:py-5">
      {/* En escritorio el motor pone compañía, precio y acción en una sola
          fila: la tarjeta deja de ser una tarjeta apilada y se lee de un
          vistazo, que es lo que importa cuando hay treinta planes. */}
      <div className="md:flex md:items-center md:gap-6">
        <div className="flex items-center justify-between gap-3 md:w-52 md:shrink-0 md:flex-col md:items-start md:gap-1">
          <CompanyLogo quote={quote} />
          <span className="text-muted text-right text-xs md:text-left">{quote.plan}</span>
        </div>

        <div className="mt-4 flex items-end justify-between gap-4 md:mt-0 md:flex-1 md:items-center md:gap-8">
          <p className="text-primary text-2xl font-semibold md:text-3xl">
            {quote.price.formatted}
          </p>
          {quote.insuredAmount !== undefined && (
            <div className="text-right md:text-left">
              <p className="text-muted/70 text-[11px] tracking-wide uppercase">suma asegurada</p>
              <p className="text-muted text-sm font-medium">{quote.insuredAmount.formatted}</p>
            </div>
          )}
        </div>

        <div className="hidden md:block md:w-40 md:shrink-0">
          <Button onClick={onContratar}>Contratar</Button>
        </div>
      </div>

      {quote.features.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setAbierto(!abierto)}
            aria-expanded={abierto}
            className="text-primary mt-3 flex items-center gap-1 text-sm"
          >
            Ver detalle
            <ChevronDownIcon
              width={16}
              height={16}
              className={`transition-transform ${abierto ? 'rotate-180' : ''}`}
            />
          </button>
          {abierto && (
            <ul className="text-muted mt-3 flex list-disc flex-col gap-1 pl-5 text-xs">
              {quote.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="mt-4 md:hidden">
        <Button onClick={onContratar}>Contratar</Button>
      </div>
    </div>
  );
}

export function QResultados({
  resultados,
  buscandoMas,
  onContratar,
  onWhatsapp,
  onBack,
}: Props) {
  /**
   * Cobertura abierta al entrar.
   *
   * Terceros Completos Premium es la que conviene tener a la vista; el resto
   * queda plegado para que la pantalla se recorra de un vistazo. Si esa
   * cobertura todavía no trajo precios, se abre la primera que tenga.
   */
  const [abierto, setAbierto] = useState<string | null>(
    resultados.groups.find(
      (g) => /terceros completos premium/i.test(g.name) && g.quotes.length > 0,
    )?.id ??
      resultados.groups.find((g) => g.quotes.length > 0)?.id ??
      null,
  );

  return (
    <Screen onBack={onBack} title="Elegí tu cobertura" ancho="completo">
      <div className="mt-6 flex flex-col gap-3 pb-20 md:mt-10">
        {resultados.groups.map((grupo) => {
          const open = grupo.id === abierto;
          return (
            <div key={grupo.id} className="bg-surface rounded-field overflow-hidden">
              <button
                type="button"
                onClick={() => setAbierto(open ? null : grupo.id)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
              >
                <span className="text-ink text-sm font-semibold">
                  {grupo.name} ({grupo.quotes.length})
                </span>
                <ChevronDownIcon
                  width={20}
                  height={20}
                  className={`text-ink shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                />
              </button>

              {open && (
                <div className="flex flex-col gap-3 px-3 pb-3">
                  {grupo.awaitingResults ? (
                    <p className="text-muted py-6 text-center text-sm">
                      Buscando precios para esta cobertura…
                    </p>
                  ) : (
                    grupo.quotes.map((quote) => (
                      <QuoteCard
                        key={`${quote.company}-${quote.code}`}
                        quote={quote}
                        onContratar={() => onContratar(quote)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {buscandoMas === true && (
        <p className="text-accent mt-6 pb-4 text-center text-sm" role="status">
          Seguimos buscando más opciones para vos…
        </p>
      )}

      {onWhatsapp !== undefined && (
        <button
          type="button"
          onClick={onWhatsapp}
          aria-label="Hablar por WhatsApp"
          className="bg-whatsapp fixed right-5 bottom-6 flex size-14 items-center justify-center rounded-full text-white shadow-lg"
        >
          <WhatsappIcon width={28} height={28} />
        </button>
      )}
    </Screen>
  );
}
