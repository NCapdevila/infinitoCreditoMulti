import { Screen } from '../../components/Screen.tsx';
import { WhatsappIcon } from '../../components/icons.tsx';

/**
 * Pantalla de espera mientras las compañías cotizan.
 *
 * En el motor real esto dura lo que tarden: en la cotización observada, 22
 * segundos hasta el último plan. Por eso el texto habla de segundos y hay un
 * acceso a WhatsApp a mano.
 *
 * La animación es el mismo GIF que usa el multi: 500×500, 228 cuadros, **2,42
 * MB**. Es mucho para una pantalla que aparece de golpe y a la que se llega
 * después de diez pasos, así que el `index.html` lo va bajando en segundo plano
 * desde el arranque y acá ya está en caché. El `width`/`height` es por lo mismo:
 * sin ellos, el texto salta cuando la imagen termina de bajar.
 *
 * Achicarlo o pasarlo a vídeo es lo que de verdad lo arregla; 2,42 MB para una
 * animación de 500 px es entre diez y veinte veces lo que costaría en webm.
 */
interface Props {
  readonly onWhatsapp?: () => void;
  /** Por defecto, el texto del motor mientras cotizan las compañías. */
  readonly titulo?: string;
  readonly descripcion?: string;
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
        {/*
          El lienzo del GIF es cuadrado pero el dibujo no lo llena: medido, ocupa
          de y=68 a y=289 de 500, o sea 68 px vacíos arriba y 210 abajo. Sin
          recortar eso, el auto queda flotando y el texto se va al fondo de la
          pantalla. Los márgenes negativos se comen parte de ese vacío —menos del
          que sobra, para dar aire y por si algún cuadro se sale de la caja del
          primero—. Es vacío transparente: no tapan nada.
        */}
        <img
          src="/cart.gif"
          alt=""
          width={500}
          height={500}
          className="mx-auto -mt-4 -mb-16 w-full max-w-[280px]"
        />
        {/*
          El auto es la señal de que algo está pasando: ya no hay spinner. Para
          quien no lo ve, el aviso lo da este texto —por eso el `role`—.
        */}
        <p role="status" className="text-muted mt-8 text-center text-sm text-balance">
          {descripcion ??
            'Estamos buscando los mejores seguros para tu auto. Esto puede demorar unos segundos más...'}
        </p>
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
