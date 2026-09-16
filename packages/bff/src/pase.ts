import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { normalizarOrigen, sitiosEmbebibles } from './seguridad.js';

/**
 * Pase de embebido.
 *
 * El cotizador sólo tiene que funcionar adentro del iframe de una agencia
 * habilitada, y las agencias no pueden cambiar nada de su lado: siguen pegando
 * el mismo `<iframe>`, sin token ni script. Así que la prueba de «esto se cargó
 * desde una agencia» la tiene que fabricar este servidor en el único momento en
 * que la ve: cuando el navegador pide el HTML.
 *
 * En ese pedido el navegador dice dos cosas que una página no puede falsificar:
 * `Sec-Fetch-Dest: iframe` —se está cargando adentro de un marco— y el `Referer`
 * con el origen del sitio que lo contiene. Si las dos cierran, el HTML sale con
 * un pase firmado en un `<meta>`, y el front lo manda en cada llamada a `/api`.
 *
 * **Qué no hace:** frenar a un script. `curl` puede mandar esas dos cabeceras
 * inventadas y llevarse un pase. Lo que este control corta es usar el cotizador
 * desde un navegador fuera de una agencia, y el `curl` directo a `/api` sin
 * pasar primero por el HTML. Contra los scripts están el reCAPTCHA y exigir una
 * cotización real antes de emitir.
 *
 * **Por qué no una cookie:** Safari y Chrome bloquean las cookies de terceros
 * adentro de un iframe, y el cotizador *es* un tercero en el sitio de la agencia.
 * Un pase en una cabecera no depende de eso.
 */

/** Lo que dura un pase. Una carga de punta a punta entra holgada. */
export const DURACION_PASE_MS = 2 * 60 * 60 * 1000;

export interface Pase {
  /** Origen de la agencia desde la que se cargó el iframe. */
  readonly origen: string;
  /** Emitido y vencimiento, en segundos desde la época, como en un JWT. */
  readonly iat: number;
  readonly exp: number;
  /** Hace que dos pases emitidos en el mismo segundo no sean iguales. */
  readonly nonce: string;
}

/** Las variables de entorno. Es parámetro porque Vite las lee de otro lado. */
type Entorno = Readonly<Record<string, string | undefined>>;

export const esProduccion = (entorno: Entorno = process.env) =>
  entorno['NODE_ENV'] === 'production';

/**
 * Secreto de desarrollo.
 *
 * Es público —está en el repo—, así que un pase firmado con él no prueba nada.
 * Sirve para que `npm run dev` ande sin configurar variables; en producción el
 * servidor se niega a arrancar si no hay uno propio.
 */
const SECRETO_DESARROLLO = 'desarrollo-no-usar-en-produccion-este-secreto-es-publico';

/** Largo mínimo del secreto en producción: 32 bytes en base64url son 43 caracteres. */
const LARGO_MINIMO = 32;

/** Con qué secreto se firman y verifican los pases. */
export function secretoDelPase(entorno: Entorno = process.env): string {
  const propio = entorno['PASE_SECRETO'] ?? '';
  return propio !== '' ? propio : SECRETO_DESARROLLO;
}

/**
 * Qué impide arrancar con esta configuración, o `undefined` si nada.
 *
 * Sólo exige en producción. En desarrollo la falta del secreto no es un
 * problema: se avisa al arrancar y se usa el de desarrollo.
 */
export function problemaDeConfiguracion(entorno: Entorno = process.env): string | undefined {
  if (!esProduccion(entorno)) return undefined;
  const secreto = entorno['PASE_SECRETO'] ?? '';
  if (secreto === '') return 'PASE_SECRETO no está definida y es obligatoria en producción';
  if (secreto.length < LARGO_MINIMO) {
    return `PASE_SECRETO tiene que tener al menos ${LARGO_MINIMO} caracteres`;
  }
  return undefined;
}

// ── el token ───────────────────────────────────────────────────────────

const firmar = (datos: string, secreto: string) =>
  createHmac('sha256', secreto).update(datos).digest('base64url');

/**
 * Emite un pase para una agencia.
 *
 * El formato es `datos.firma`, los dos en base64url: los datos son el JSON del
 * pase y la firma, su HMAC-SHA256. No es un JWT —no hace falta la cabecera ni
 * elegir algoritmo, y no negociar el algoritmo es una clase entera de bugs
 * menos—, pero se lee igual de fácil.
 */
export function emitirPase(origen: string, secreto: string, ahora: number = Date.now()): string {
  const iat = Math.floor(ahora / 1000);
  const pase: Pase = {
    origen,
    iat,
    exp: iat + DURACION_PASE_MS / 1000,
    nonce: randomBytes(12).toString('base64url'),
  };
  const datos = Buffer.from(JSON.stringify(pase)).toString('base64url');
  return `${datos}.${firmar(datos, secreto)}`;
}

export type ResultadoPase =
  | { readonly valido: true; readonly pase: Pase }
  | { readonly valido: false; readonly motivo: string };

const esPase = (valor: unknown): valor is Pase =>
  typeof valor === 'object' &&
  valor !== null &&
  typeof (valor as Pase).origen === 'string' &&
  typeof (valor as Pase).iat === 'number' &&
  typeof (valor as Pase).exp === 'number' &&
  typeof (valor as Pase).nonce === 'string';

/**
 * Verifica firma y vencimiento.
 *
 * La firma se compara antes de mirar el contenido, y en tiempo constante: si
 * se compara con `===`, cuánto tarda en fallar dice cuántos caracteres del
 * principio estaban bien, y eso alcanza para ir adivinándola.
 */
export function verificarPase(
  token: string,
  secreto: string,
  ahora: number = Date.now(),
): ResultadoPase {
  const partes = token.split('.');
  if (partes.length !== 2) return { valido: false, motivo: 'formato inválido' };
  const [datos = '', firma = ''] = partes;

  const esperada = Buffer.from(firmar(datos, secreto));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
    return { valido: false, motivo: 'firma inválida' };
  }

  let pase: unknown;
  try {
    pase = JSON.parse(Buffer.from(datos, 'base64url').toString('utf-8'));
  } catch {
    return { valido: false, motivo: 'formato inválido' };
  }
  if (!esPase(pase)) return { valido: false, motivo: 'formato inválido' };
  if (pase.exp * 1000 <= ahora) return { valido: false, motivo: 'vencido' };

  return { valido: true, pase };
}

// ── quién está habilitado ──────────────────────────────────────────────

const esLocal = (origen: string) => {
  const { hostname } = new URL(origen);
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
};

/**
 * ¿Puede este origen tener un pase?
 *
 * Se vuelve a preguntar en cada llamada a `/api`, no sólo al emitirlo: así,
 * sacar una agencia de `SITIOS_EMBEBIBLES` corta al instante los pases que ya
 * tenía, sin esperar a que venzan.
 */
export function origenHabilitado(origen: string): boolean {
  if (sitiosEmbebibles().includes(origen)) return true;
  return !esProduccion() && esLocal(origen);
}

export interface PedidoDeDocumento {
  /** `Sec-Fetch-Dest`. Safari anterior a 16.4 no lo manda. */
  readonly destino: string | undefined;
  readonly referer: string | undefined;
  /** El `Host` del pedido: sólo cuenta en desarrollo. */
  readonly host: string | undefined;
}

export type VeredictoDocumento =
  | { readonly permitido: true; readonly origen: string }
  | { readonly permitido: false; readonly motivo: string };

/**
 * ¿Se sirve el HTML del cotizador a este pedido?
 *
 * - Adentro de un iframe (`Sec-Fetch-Dest: iframe`) de una agencia habilitada
 *   según el `Referer`: sí, y el pase sale con ese origen.
 * - **Sin `Sec-Fetch-Dest`** decide el `Referer` solo. Lo omiten los Safari
 *   anteriores a 16.4, y rechazarlos dejaba afuera a los vendedores con un
 *   iPhone viejo sin ganar nada: un script puede inventar la cabecera igual.
 *   Abrir la URL directo sigue bloqueado, porque ahí no hay `Referer`.
 * - Con cualquier otro destino —abrir la URL en una pestaña es `document`—: no.
 * - En desarrollo, además, se puede abrir directo desde `localhost`, para probar
 *   el front compilado sin armar una página con un iframe.
 */
export function evaluarDocumento({ destino, referer, host }: PedidoDeDocumento): VeredictoDocumento {
  if (destino === 'document' && !esProduccion() && host !== undefined) {
    const propio = normalizarOrigen(`http://${host}`);
    if (propio !== undefined && esLocal(propio)) return { permitido: true, origen: propio };
  }

  if (destino !== undefined && destino !== 'iframe') {
    return { permitido: false, motivo: `no es un iframe (Sec-Fetch-Dest: ${destino})` };
  }
  if (referer === undefined || referer === '') {
    return { permitido: false, motivo: 'sin referer' };
  }

  const origen = normalizarOrigen(referer);
  if (origen === undefined) return { permitido: false, motivo: `referer inválido: ${referer}` };
  if (!origenHabilitado(origen)) {
    return { permitido: false, motivo: `origen no habilitado: ${origen}` };
  }
  return { permitido: true, origen };
}

export type Autorizacion =
  | { readonly autorizado: true; readonly origen: string }
  | { readonly autorizado: false; readonly motivo: string };

/** Lee el pase de `Authorization: Pase <token>`. */
export function paseDeCabecera(authorization: string | undefined): string | undefined {
  return /^Pase\s+(\S+)$/i.exec(authorization?.trim() ?? '')?.[1];
}

/** ¿Puede este pedido usar `/api`? */
export function autorizarApi(
  authorization: string | undefined,
  secreto: string,
  ahora: number = Date.now(),
): Autorizacion {
  const token = paseDeCabecera(authorization);
  if (token === undefined) return { autorizado: false, motivo: 'sin pase' };

  const resultado = verificarPase(token, secreto, ahora);
  if (!resultado.valido) return { autorizado: false, motivo: resultado.motivo };

  const { origen } = resultado.pase;
  if (!origenHabilitado(origen)) {
    return { autorizado: false, motivo: `origen no habilitado: ${origen}` };
  }
  return { autorizado: true, origen };
}

/**
 * Deja el pase en el HTML, justo antes de cerrar el `<head>`.
 *
 * El token es base64url y un punto: no tiene nada que escapar en un atributo.
 * Se verifica igual, porque si alguna vez cambia el formato esto se rompería en
 * silencio.
 */
export function inyectarPase(html: string, token: string): string {
  if (!/^[\w.-]+$/.test(token)) throw new Error('el pase tiene caracteres inesperados');
  return html.replace('</head>', `  <meta name="pase" content="${token}" />\n  </head>`);
}
