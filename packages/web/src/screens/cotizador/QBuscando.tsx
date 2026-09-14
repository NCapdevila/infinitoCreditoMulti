import { Screen } from '../../components/Screen.tsx';
import { WhatsappIcon } from '../../components/icons.tsx';

/**
 * Pantalla de espera mientras las compañías cotizan.
 *
 * En el motor real esto dura lo que tarden: en la cotización observada, 22
 * segundos hasta el último plan. Por eso el texto habla de segundos y hay un
 * acceso a WhatsApp a mano.
 *
 * Nota de performance: el multi actual resuelve esta pantalla con un GIF de
 * 2,4 MB. Acá la ilustración es SVG inline — pesa nada y no bloquea.
 */
interface Props {
  readonly onWhatsapp?: () => void;
  /** Por defecto, el texto del motor mientras cotizan las compañías. */
  readonly titulo?: string;
  readonly descripcion?: string;
}

function AutoIlustracion() {
  return (
    <svg viewBox="0 0 260 150" className="mx-auto w-full max-w-[260px]" role="img" aria-hidden="true">
      <path
        d="M30 96c-10-34 6-62 40-70s74 2 88 28 6 50-18 62-64 8-84-4-16-8-26-16Z"
        fill="var(--color-primary)"
        opacity="0.1"
      />
      <ellipse cx="152" cy="44" rx="20" ry="12" fill="var(--color-primary)" opacity="0.18" />
      <path
        d="M52 92V78l14-22a10 10 0 0 1 8-4h56a10 10 0 0 1 8 4l16 22h24a10 10 0 0 1 10 10v4H52Z"
        fill="var(--color-primary)"
      />
      <path d="M74 56h50l12 18H64l10-18Z" fill="#fff" opacity="0.28" />
      <circle cx="84" cy="99" r="13" fill="var(--color-navy)" />
      <circle cx="84" cy="99" r="5" fill="#fff" />
      <circle cx="164" cy="99" r="13" fill="var(--color-navy)" />
      <circle cx="164" cy="99" r="5" fill="#fff" />
      <path d="M36 112h190" stroke="var(--color-navy)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function QBuscando({ onWhatsapp, titulo, descripcion }: Props) {
  return (
    <Screen
      title={
        titulo ?? (
          <>
            ¡Gracias
            <br />
            por esperar!
          </>
        )
      }
    >
      <div className="mt-10">
        <AutoIlustracion />
        <p className="text-muted mt-8 text-center text-sm text-balance">
          {descripcion ??
            'Estamos buscando los mejores seguros para tu auto. Esto puede demorar unos segundos más...'}
        </p>

        {/*
          Sólo el spinner: los puntos que había antes leían como un segundo
          indicador de carga y confundían más de lo que aportaban.
        */}
        <div className="mt-10 flex justify-center" role="status" aria-label="Buscando coberturas">
          <span className="border-line/40 border-t-primary size-9 animate-spin rounded-full border-4" />
        </div>
      </div>

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
