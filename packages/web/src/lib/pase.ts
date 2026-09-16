/**
 * El pase de embebido.
 *
 * El BFF lo deja en un `<meta name="pase">` al servir esta página, y sólo si la
 * página se está cargando adentro del iframe de una agencia habilitada. Todo
 * `/api` lo pide en `Authorization`: sin él, contesta 401.
 *
 * Va en una cabecera y no en una cookie porque adentro de un iframe el
 * cotizador es un tercero, y Safari y Chrome bloquean las cookies de terceros.
 */

let leido: string | undefined;
let yaSeBusco = false;

function pase(): string | undefined {
  if (!yaSeBusco) {
    yaSeBusco = true;
    const contenido = document.querySelector<HTMLMetaElement>('meta[name="pase"]')?.content;
    leido = contenido !== undefined && contenido !== '' ? contenido : undefined;
    if (leido === undefined) {
      // No se corta acá: la API va a contestar 401 y la pantalla lo muestra. Esto
      // es para que quien mira la consola sepa por qué.
      console.error(
        '[pase] la página no trae pase: en producción el HTML lo tiene que servir el BFF, ' +
          'y en desarrollo lo agrega Vite.',
      );
    }
  }
  return leido;
}

/** Cabeceras para llamar a `/api`, con el pase si lo hay. */
export function cabecerasDeApi(otras: Readonly<Record<string, string>> = {}): Record<string, string> {
  const token = pase();
  return token !== undefined ? { ...otras, Authorization: `Pase ${token}` } : { ...otras };
}
