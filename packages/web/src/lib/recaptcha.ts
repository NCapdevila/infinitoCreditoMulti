import type { Accion } from '@infinito/bff/recaptcha';

/**
 * reCAPTCHA v3 en el cotizador.
 *
 * El BFF lo exige para crear la cotización, armar la constancia y mandar la
 * solicitud. Lo carga sólo la app, dentro del iframe: las agencias no agregan
 * nada, y la clave está registrada para el dominio de la app.
 *
 * El script se baja apenas arranca la app y no recién al primer uso: v3 puntúa
 * mirando cómo se usa la página, y cuanto antes empieza a mirar, mejor puntaje
 * le da a un vendedor de verdad.
 */

declare global {
  interface Window {
    grecaptcha?: {
      ready(hacer: () => void): void;
      execute(clave: string, opciones: { action: string }): Promise<string>;
    };
  }
}

/** Se fija al compilar: cambiarla en el `.env` pide volver a correr el build. */
const CLAVE = import.meta.env.VITE_RECAPTCHA_SITE_KEY ?? '';

/** Este build usa reCAPTCHA: hay que mostrar la leyenda de Google. */
export const recaptchaActivo = CLAVE !== '';

let carga: Promise<boolean> | undefined;

/** Baja el script de Google una sola vez. Resuelve `true` cuando está listo. */
export function cargarRecaptcha(): Promise<boolean> {
  if (carga !== undefined) return carga;

  if (CLAVE === '') {
    // En desarrollo es lo esperable si no se cargaron claves: el BFF también
    // saltea la verificación. En un build de producción es un error de
    // configuración, y fallar en silencio lo escondería detrás de un 403.
    const aviso = import.meta.env.DEV ? console.warn : console.error;
    aviso(
      '[recaptcha] VITE_RECAPTCHA_SITE_KEY está vacía en este build: las operaciones ' +
        'protegidas van sin token y el BFF las rechaza si tiene RECAPTCHA_SECRETO.',
    );
    carga = Promise.resolve(false);
    return carga;
  }

  carga = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(CLAVE)}`;
    script.async = true;
    script.onload = () => {
      if (window.grecaptcha === undefined) resolve(false);
      else window.grecaptcha.ready(() => resolve(true));
    };
    script.onerror = () => {
      console.error('[recaptcha] no se pudo cargar el script de Google');
      resolve(false);
    };
    document.head.append(script);
  });
  return carga;
}

/**
 * La cabecera con un token para `accion`, pedido en el momento.
 *
 * No se cachea: un token vence a los dos minutos y sirve para una sola
 * verificación. Si no se pudo obtener, devuelve un objeto vacío y el pedido sale
 * igual: el BFF lo rechaza con un mensaje que la pantalla ya sabe mostrar.
 */
export async function cabeceraRecaptcha(accion: Accion): Promise<Record<string, string>> {
  if (!(await cargarRecaptcha()) || window.grecaptcha === undefined) return {};
  try {
    return { 'X-Recaptcha': await window.grecaptcha.execute(CLAVE, { action: accion }) };
  } catch (error) {
    console.error('[recaptcha] no se pudo obtener un token', error);
    return {};
  }
}
