/**
 * reCAPTCHA v3.
 *
 * El pase prueba que el HTML se sirvió a un iframe de una agencia, pero un
 * script puede pedirlo inventando las cabeceras. Lo que un script no puede
 * fabricar es un token de reCAPTCHA con buen puntaje: Google lo emite mirando
 * el comportamiento de un navegador de verdad sobre la página.
 *
 * Se pide en las tres operaciones que valen algo para un abuso: crear una
 * cotización —que abre una sesión en el motor—, armar la constancia y mandar la
 * solicitud. Lo carga sólo el cotizador: las agencias no hacen nada, y la clave
 * se registra para el dominio de la app, no para el de ellas.
 */

export const ACCIONES = ['cotizar', 'constancia', 'solicitud'] as const;
export type Accion = (typeof ACCIONES)[number];

/** Lo que ve el vendedor cuando se rechaza: no hay nada que él pueda corregir. */
export const MENSAJE_RECHAZO = 'No pudimos validar la operación, probá de nuevo.';

const URL_VERIFICACION = 'https://www.google.com/recaptcha/api/siteverify';

/** Cuánto se espera a Google antes de darlo por caído. */
const ESPERA_MS = 5_000;

type Entorno = Readonly<Record<string, string | undefined>>;

export interface ConfigRecaptcha {
  readonly secreto: string;
  readonly scoreMinimo: number;
  /** Hostnames que Google puede informar: el de la app, y en desarrollo localhost. */
  readonly hostnames: readonly string[];
}

const esProduccion = (entorno: Entorno) => entorno['NODE_ENV'] === 'production';

/**
 * El puntaje mínimo, entre 0 y 1.
 *
 * Un valor que no se entiende cae al default y no a 0: un typo en la variable
 * no puede terminar aceptando cualquier cosa.
 */
export function scoreMinimo(entorno: Entorno = process.env): number {
  const valor = Number.parseFloat(entorno['RECAPTCHA_SCORE_MINIMO'] ?? '');
  return Number.isFinite(valor) && valor >= 0 && valor <= 1 ? valor : 0.5;
}

/**
 * La configuración, o `undefined` si está desactivado.
 *
 * Sólo se desactiva en desarrollo y sin secreto: así `npm run dev` anda sin
 * claves. En producción sin secreto el servidor no arranca —ver
 * `problemaDeConfiguracion`—, de modo que acá nunca se llega a desactivarlo.
 */
export function configRecaptcha(entorno: Entorno = process.env): ConfigRecaptcha | undefined {
  const secreto = entorno['RECAPTCHA_SECRETO'] ?? '';
  if (secreto === '') return undefined;

  const propios = (entorno['RECAPTCHA_HOSTNAMES'] ?? 'infinito.cebrokers.com.ar')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h !== '');
  const hostnames = esProduccion(entorno) ? propios : [...propios, 'localhost', '127.0.0.1'];

  return { secreto, scoreMinimo: scoreMinimo(entorno), hostnames };
}

export function problemaDeConfiguracion(entorno: Entorno = process.env): string | undefined {
  if (esProduccion(entorno) && (entorno['RECAPTCHA_SECRETO'] ?? '') === '') {
    return 'RECAPTCHA_SECRETO no está definida y es obligatoria en producción';
  }
  return undefined;
}

export type ResultadoRecaptcha =
  | { readonly valido: true; readonly score: number }
  | {
      readonly valido: false;
      /** 403 si Google lo rechazó; 503 si no se pudo preguntar. */
      readonly status: 403 | 503;
      readonly motivo: string;
      readonly score?: number;
    };

interface RespuestaGoogle {
  readonly success?: boolean;
  readonly score?: number;
  readonly action?: string;
  readonly hostname?: string;
  readonly 'error-codes'?: readonly string[];
}

/**
 * Verifica un token contra Google.
 *
 * Todo lo que no sea una respuesta clara y buena es un rechazo, incluido que
 * Google no conteste: si se dejara pasar ante un error de red, tirar la
 * conexión con Google alcanzaría para saltearse el control entero.
 *
 * Se mira la acción porque un token es de una acción: sin eso, uno sacado para
 * `cotizar` —la más barata— serviría para mandar una solicitud. Y el hostname
 * porque una clave sin validación de dominio emite tokens para cualquier sitio.
 */
export async function verificarRecaptcha(
  token: string | undefined,
  accion: Accion,
  config: ConfigRecaptcha,
  pedir: typeof fetch = fetch,
): Promise<ResultadoRecaptcha> {
  if (token === undefined || token === '') {
    return { valido: false, status: 403, motivo: 'sin token' };
  }

  let respuesta: RespuestaGoogle;
  try {
    const res = await pedir(URL_VERIFICACION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: config.secreto, response: token }),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    if (!res.ok) return { valido: false, status: 503, motivo: `Google respondió ${res.status}` };
    respuesta = (await res.json()) as RespuestaGoogle;
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    return { valido: false, status: 503, motivo: `no se pudo verificar: ${detalle}` };
  }

  const score = typeof respuesta.score === 'number' ? respuesta.score : undefined;
  const conScore = score !== undefined ? { score } : {};

  if (respuesta.success !== true) {
    const codigos = respuesta['error-codes']?.join(', ') ?? 'sin detalle';
    return { valido: false, status: 403, motivo: `Google lo rechazó (${codigos})`, ...conScore };
  }
  if (respuesta.action !== accion) {
    return {
      valido: false,
      status: 403,
      motivo: `acción equivocada: se esperaba «${accion}» y vino «${respuesta.action ?? ''}»`,
      ...conScore,
    };
  }
  const hostname = respuesta.hostname?.toLowerCase() ?? '';
  if (!config.hostnames.includes(hostname)) {
    return { valido: false, status: 403, motivo: `hostname ajeno: ${hostname || '(vacío)'}`, ...conScore };
  }
  if (score === undefined || score < config.scoreMinimo) {
    return {
      valido: false,
      status: 403,
      motivo: `puntaje bajo: ${score ?? '(sin puntaje)'} < ${config.scoreMinimo}`,
      ...conScore,
    };
  }

  return { valido: true, score };
}
