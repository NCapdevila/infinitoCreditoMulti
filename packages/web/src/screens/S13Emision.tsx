import { Button } from '../components/Button.tsx';
import { Modal } from '../components/Modal.tsx';
import { Screen } from '../components/Screen.tsx';

/**
 * S13 · «¡Tu póliza está en proceso de emisión!»
 *
 * Pantalla terminal: no ofrece volver atrás, porque el formulario ya se envió.
 */
interface Props {
  readonly onWhatsapp: () => void;
  readonly onDescargar: () => void;
  readonly descargando?: boolean;
  readonly errorDescarga?: string | null;
  /** Id del correo enviado; es el comprobante de la solicitud. */
  readonly referencia?: string | null;
  /** A qué dirección se le mandó la constancia al comprador. */
  readonly emailCliente?: string;
  /** Si no llegó, el vendedor tiene que enterarse para pasársela él. */
  readonly constanciaAlCliente?: { readonly enviada: boolean; readonly error?: string };
}

/**
 * Check de confirmación.
 *
 * Reemplaza a la ilustración del auto: acá el auto ya no es la novedad —la
 * novedad es que el trámite salió—, y un tilde lo dice sin que haya que leer.
 * Mantiene el tamaño que ocupaba la ilustración para que la pantalla no salte.
 */
function CheckEmitido() {
  return (
    <svg
      viewBox="0 0 260 150"
      className="mx-auto w-full max-w-[250px]"
      role="img"
      aria-label="Solicitud enviada"
    >
      <circle cx="130" cy="75" r="52" fill="var(--color-success)" opacity="0.15" />
      <circle cx="130" cy="75" r="40" fill="var(--color-success)" />
      <path
        d="m112 76 13 13 24-26"
        fill="none"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function S13Emision({
  onWhatsapp,
  onDescargar,
  descargando,
  errorDescarga,
  referencia,
  emailCliente,
  constanciaAlCliente,
}: Props) {
  return (
    <Screen ancho="campo" eyebrow="Muchas gracias" title="¡Tu póliza está en proceso de emisión!">
      <div className="mt-8">
        <CheckEmitido />
      </div>

      <p className="text-muted mt-8 text-center text-sm text-balance">
        A la brevedad un asesor se pondrá en contacto con vos para enviarte la documentación
        definitiva.
      </p>

      {constanciaAlCliente !== undefined && (
        <div
          className={`rounded-field mt-8 p-4 text-center text-sm ${
            constanciaAlCliente.enviada
              ? 'bg-surface text-muted'
              : 'border border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {constanciaAlCliente.enviada ? (
            <>
              Le enviamos la constancia a <strong>{emailCliente}</strong>.
            </>
          ) : (
            <>
              <strong>No pudimos enviarle la constancia al cliente.</strong>
              <span className="mt-1 block text-xs">
                La solicitud sí llegó a emisiones. Descargá la constancia y hacésela llegar vos.
              </span>
            </>
          )}
        </div>
      )}

      {referencia !== null && referencia !== undefined && (
        <p className="text-muted/80 mt-4 text-center text-xs break-all">
          Referencia: {referencia.replace(/[<>]/g, '')}
        </p>
      )}

      {/* La constancia es lo que el vendedor necesita llevarse: va primero. */}
      <div className="mt-10">
        <Button onClick={onDescargar} disabled={descargando === true}>
          {descargando === true ? 'Generando…' : 'Descargar certificado'}
        </Button>
      </div>
      {errorDescarga !== null && errorDescarga !== undefined && (
        <p role="alert" className="mt-3 text-center text-sm text-red-600">
          {errorDescarga}
        </p>
      )}

      <p className="text-accent mt-10 text-center text-base font-semibold">¿Dudas o consultas?</p>
      <div className="mt-4">
        <Button variant="whatsapp" onClick={onWhatsapp}>
          Hablemos por Whatsapp
        </Button>
      </div>
    </Screen>
  );
}

/**
 * Modal de verificación requerida (`Cotizador 23` del export).
 *
 * FUERA DEL FLUJO por ahora: al confirmar se va directo a la pantalla final.
 * Se deja implementado porque la pantalla existe en el diseño y la situación es
 * real —no toda póliza se emite sola—, pero falta definir quién decide que hace
 * falta verificación y qué pasa después. Para reponerlo, se muestra entre
 * «Confirmar datos» y S13.
 */
export function ModalVerificacion({
  open,
  onContinuar,
}: {
  readonly open: boolean;
  readonly onContinuar: () => void;
}) {
  return (
    <Modal
      open={open}
      eyebrow="Verificación requerida"
      title="Esta póliza requiere una verificación"
      actions={<Button onClick={onContinuar}>Continuar con la emisión asistida</Button>}
    >
      <svg viewBox="0 0 200 150" className="mx-auto h-32 w-auto" role="img" aria-hidden="true">
        <path
          d="M38 74c-6-28 14-52 44-56s56 10 64 34 2 50-20 62-56 8-70-8-12-20-18-32Z"
          fill="var(--color-primary)"
          opacity="0.1"
        />
        <path
          d="M76 40h36l19 19v55a6 6 0 0 1-6 6H76a6 6 0 0 1-6-6V46a6 6 0 0 1 6-6Z"
          fill="var(--color-primary)"
        />
        <path d="M112 40l19 19h-19V40Z" fill="var(--color-navy)" />
      </svg>
      <p className="text-accent mt-6 text-center text-sm text-balance">
        Hacé clic acá y un emisor se va a contactar con vos para ayudarte a finalizar la emisión.
      </p>
    </Modal>
  );
}
