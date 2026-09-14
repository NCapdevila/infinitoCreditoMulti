import type { IncomingMessage } from 'node:http';

/**
 * Quién puede hablarle al BFF, desde dónde y cuánto.
 *
 * La app se embebe en los sitios de las agencias, así que hay dos controles
 * distintos y conviene no confundirlos:
 *
 * - **`frame-ancestors`** (`SITIOS_EMBEBIBLES`) decide qué sitios pueden meter
 *   la app en un `<iframe>`. Es el que importa para el embebido; la cabecera la
 *   tiene que mandar además quien sirve el HTML del front (ver README).
 * - **CORS** (`ORIGENES_PERMITIDOS`) decide desde qué origen se puede llamar a
 *   `/api`. Ojo que **no son la misma lista**: dentro de un iframe, el `fetch`
 *   sale con el origen de la app, no con el del sitio que la embebe. Si el
 *   front y el BFF comparten dominio —lo normal detrás de un reverse proxy— eso
 *   ya está cubierto por el chequeo de mismo origen de más abajo y la variable
 *   puede quedar vacía.
 *
 * El chequeo de `Origin` no está por el navegador: está para cortar la petición
 * **antes** de mandar un correo o armar un PDF, en vez de hacer el trabajo y
 * dejar que el navegador esconda la respuesta.
 *
 * Lo que ninguno de los dos hace es frenar a quien no usa un navegador: `curl`
 * no manda `Origin` y no mira las cabeceras de respuesta. Contra eso están el
 * tope de cuerpo y el rate limit de más abajo, que es lo que evita que
 * `/api/solicitud` se use como relay de correo o para voltear el proceso.
 */

// ── orígenes ───────────────────────────────────────────────────────────

/** Métodos y cabeceras que la API acepta desde otro origen. */
const METODOS = 'GET, POST, OPTIONS';
const CABECERAS = 'Content-Type';

/** Cuánto puede cachear el navegador el preflight, en segundos. */
const PREFLIGHT_MAX_AGE = '600';

/**
 * Los orígenes de desarrollo.
 *
 * Son el default cuando `ORIGENES_PERMITIDOS` no está definida: sin esto, al
 * clonar el repo y levantar `npm run dev` no andaría nada y el error no diría
 * por qué. En producción la variable **tiene** que estar; el server avisa al
 * arrancar si falta.
 */
const DESARROLLO = [
  'http://localhost:5180',
  'http://127.0.0.1:5180',
  'https://localhost:5443',
] as const;

/**
 * Deja un origen en su forma canónica: `esquema://host[:puerto]`, en minúsculas
 * y sin barra final.
 *
 * Compara `https://Agencia.com.ar/` con `https://agencia.com.ar` sin que la
 * diferencia dependa de cómo se escribió la variable de entorno. Devuelve
 * `undefined` si no es un origen http(s) válido.
 */
export function normalizarOrigen(valor: string): string | undefined {
  const texto = valor.trim();
  if (texto === '') return undefined;
  try {
    const url = new URL(texto);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.origin.toLowerCase();
  } catch {
    return undefined;
  }
}

/** Lee una variable con orígenes separados por coma, descartando lo que no sirva. */
function leerLista(variable: string): readonly string[] {
  return (process.env[variable] ?? '')
    .split(',')
    .map(normalizarOrigen)
    .filter((origen): origen is string => origen !== undefined);
}

/** ¿Está declarado quién puede embeber la app, o estamos con los defaults? */
export function hayAllowlist(): boolean {
  return leerLista('SITIOS_EMBEBIBLES').length > 0;
}

/** Desde qué orígenes se acepta una llamada a `/api`. */
export function origenesPermitidos(): readonly string[] {
  const propios = leerLista('ORIGENES_PERMITIDOS');
  return propios.length > 0 ? propios : [...DESARROLLO];
}

/**
 * Qué sitios pueden meter la app en un iframe.
 *
 * Son los dos sitios de agencia. Si la variable no está, se cae a `'self'`
 * solo: el default seguro es que no la embeba nadie.
 */
export function sitiosEmbebibles(): readonly string[] {
  return leerLista('SITIOS_EMBEBIBLES');
}

/** Qué hacer con una petición según de dónde dice venir. */
export type Veredicto =
  | { readonly permitido: true; readonly cabeceras: Readonly<Record<string, string>> }
  | { readonly permitido: false; readonly motivo: string };

/**
 * Evalúa el `Origin` de una petición.
 *
 * Sin `Origin` no hay navegador de por medio —`curl`, un script, una prueba— y
 * CORS no tiene nada que decir: se deja pasar y el abuso lo frenan el tope de
 * cuerpo y el rate limit. `Origin: null` sí se rechaza: lo manda un iframe
 * sandboxeado o un `file://`, y ninguno de los dos es un sitio de la lista.
 *
 * El `host` es el de la petición. Si coincide con el origen, el front y el BFF
 * están en el mismo dominio y no hay nada cruzado que autorizar: pasa sin
 * cabeceras de CORS, que es lo que corresponde. Un atacante no puede usar esto
 * para colarse —el navegador pone el `Host` del servidor al que llama, no uno
 * elegido por la página—, y falsificarlo requiere no usar un navegador, con lo
 * que CORS ya no protegía nada de todos modos.
 */
export function evaluarOrigen(origen: string | undefined, host?: string): Veredicto {
  if (origen === undefined) return { permitido: true, cabeceras: { Vary: 'Origin' } };

  const normalizado = origen === 'null' ? undefined : normalizarOrigen(origen);

  if (
    normalizado !== undefined &&
    host !== undefined &&
    (normalizado === normalizarOrigen(`https://${host}`) ||
      normalizado === normalizarOrigen(`http://${host}`))
  ) {
    return { permitido: true, cabeceras: { Vary: 'Origin' } };
  }

  if (normalizado === undefined || !origenesPermitidos().includes(normalizado)) {
    return { permitido: false, motivo: `origen no permitido: ${origen}` };
  }

  return {
    permitido: true,
    cabeceras: {
      // El origen concreto, nunca `*`: con `*` cualquier página podría leer las
      // respuestas, que es justamente lo que se quiere evitar.
      'Access-Control-Allow-Origin': normalizado,
      'Access-Control-Allow-Methods': METODOS,
      'Access-Control-Allow-Headers': CABECERAS,
      'Access-Control-Max-Age': PREFLIGHT_MAX_AGE,
      // Sin esto, un caché intermedio puede servirle a un sitio la respuesta
      // que se armó para otro.
      Vary: 'Origin',
    },
  };
}

/**
 * Cabeceras que van en toda respuesta.
 *
 * `frame-ancestors` acá cubre lo que sirve este proceso —la constancia en PDF,
 * que también se puede embeber—. El HTML del front lo sirve otro, y ese también
 * la tiene que mandar.
 */
export function cabecerasDeSeguridad(): Readonly<Record<string, string>> {
  const sitios = sitiosEmbebibles();
  return {
    'Content-Security-Policy': `frame-ancestors 'self'${sitios.length > 0 ? ` ${sitios.join(' ')}` : ''}`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

/** Un preflight: el navegador pregunta antes de mandar el POST de verdad. */
export function esPreflight(metodo: string, origen: string | undefined): boolean {
  return metodo === 'OPTIONS' && origen !== undefined;
}

// ── rate limit ─────────────────────────────────────────────────────────

/**
 * Ventana fija por IP para los endpoints caros.
 *
 * `/api/solicitud` manda correo con adjuntos y `/api/certificado` arma un PDF:
 * son los dos que le cuestan plata o memoria al servidor si alguien los llama
 * en loop. Un vendedor emite unas pocas por hora, así que el tope es holgado
 * para el uso real y estrecho para un script.
 *
 * Está en memoria, igual que las cotizaciones: alcanza para un proceso. Con más
 * de una instancia hay que moverlo a Redis o ponerlo en el reverse proxy.
 */
interface Ventana {
  usados: number;
  hasta: number;
}

const ventanas = new Map<string, Ventana>();

export const VENTANA_MS = 60 * 60 * 1000;

function limitePorHora(): number {
  const n = Number.parseInt(process.env['LIMITE_POR_HORA'] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export interface Cupo {
  readonly permitido: boolean;
  readonly restantes: number;
  /** Cuánto falta para que la ventana se reinicie, en segundos. */
  readonly esperaSegundos: number;
}

/**
 * Descuenta un intento de la ventana de esa clave.
 *
 * `ahora` es parámetro para poder probar el vencimiento sin esperar una hora.
 */
export function consumirCupo(clave: string, ahora: number = Date.now()): Cupo {
  const maximo = limitePorHora();
  const vigente = ventanas.get(clave);
  const ventana =
    vigente !== undefined && vigente.hasta > ahora
      ? vigente
      : { usados: 0, hasta: ahora + VENTANA_MS };

  const esperaSegundos = Math.max(1, Math.ceil((ventana.hasta - ahora) / 1000));

  if (ventana.usados >= maximo) {
    ventanas.set(clave, ventana);
    return { permitido: false, restantes: 0, esperaSegundos };
  }

  ventana.usados += 1;
  ventanas.set(clave, ventana);
  return { permitido: true, restantes: maximo - ventana.usados, esperaSegundos };
}

/** Saca las ventanas vencidas para que el Map no crezca sin techo. */
export function limpiarCupos(ahora: number = Date.now()): void {
  for (const [clave, ventana] of ventanas) {
    if (ventana.hasta <= ahora) ventanas.delete(clave);
  }
}

/** Vacía todo. Sólo para los tests. */
export function reiniciarCupos(): void {
  ventanas.clear();
}

/**
 * De qué IP viene la petición.
 *
 * Detrás de un reverse proxy, `remoteAddress` es siempre la del proxy y el
 * límite sería uno solo para todo el mundo. `X-Forwarded-For` lo arregla, pero
 * la puede escribir cualquiera, así que sólo se mira si el despliegue declara
 * que hay un proxy adelante que la sanea.
 */
export function ipDe(req: IncomingMessage): string {
  if (process.env['CONFIAR_EN_PROXY'] === '1') {
    const reenviada = req.headers['x-forwarded-for'];
    const cruda = Array.isArray(reenviada) ? reenviada[0] : reenviada;
    const primera = cruda?.split(',')[0]?.trim();
    if (primera !== undefined && primera !== '') return primera;
  }
  return req.socket.remoteAddress ?? 'desconocida';
}

// ── tamaño del cuerpo ──────────────────────────────────────────────────

/** El cuerpo se pasó del tope: se responde 413 y no se lee el resto. */
export class ErrorDemasiadoGrande extends Error {}

/** Tope para los cuerpos comunes: son JSON de un formulario, no llegan a esto. */
export const LIMITE_JSON = 1024 * 1024;

/**
 * Tope para `/api/solicitud`, que es el único que lleva adjuntos.
 *
 * Las nueve fotos comprimidas suman ~3 MB, y en base64 crecen un tercio; la
 * cédula del 0 KM puede venir en PDF sin comprimir. 20 MB deja margen para eso
 * y sigue muy por debajo de lo que haría falta para voltear el proceso.
 */
export function limiteSolicitud(): number {
  const mb = Number.parseInt(process.env['LIMITE_SOLICITUD_MB'] ?? '', 10);
  return (Number.isFinite(mb) && mb > 0 ? mb : 20) * 1024 * 1024;
}

/**
 * Lee el cuerpo sin pasarse de `maximo` bytes.
 *
 * El `Content-Length` se mira primero para cortar antes de recibir nada, pero no
 * se le cree: puede mentir o no venir. Por eso se cuenta lo que llega de verdad.
 */
export async function leerCuerpoLimitado(req: IncomingMessage, maximo: number): Promise<string> {
  const declarado = Number.parseInt(req.headers['content-length'] ?? '', 10);
  if (Number.isFinite(declarado) && declarado > maximo) {
    throw new ErrorDemasiadoGrande(`el cuerpo supera el máximo de ${maximo} bytes`);
  }

  const trozos: Buffer[] = [];
  let total = 0;
  for await (const trozo of req) {
    const buffer = trozo as Buffer;
    total += buffer.length;
    if (total > maximo) {
      throw new ErrorDemasiadoGrande(`el cuerpo supera el máximo de ${maximo} bytes`);
    }
    trozos.push(buffer);
  }
  return Buffer.concat(trozos).toString('utf-8');
}
