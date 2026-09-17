import type { ChoiceOption, Step, VehiculoDelMotor } from '@infinito/bff/motor/types';
import type { Quotations, Quote } from '@infinito/bff/motor/quotations';
import { cabecerasDeApi } from './pase.ts';
import { cabeceraRecaptcha } from './recaptcha.ts';

/**
 * Cliente del BFF.
 *
 * El front no habla con el motor: no ve HTML, ni el token de sesión, ni el
 * CSRF. Todo eso queda del lado del servidor.
 */

/** Estado de una cotización, tal como lo devuelve el BFF. */
export interface EstadoCotizacion {
  readonly id: string;
  readonly paso: Step;
  /** El motor ya está cotizando: corresponde pedir resultados, no pasos. */
  readonly cotizando: boolean;
  /**
   * A dónde lleva el botón de volver, o `null` si es el primer paso.
   *
   * Lo decide el BFF, que es el que sabe por dónde pasó la cotización. El front
   * no lleva la cuenta: si la llevara, tendría que coincidir con la del
   * servidor —que es la que autoriza— y bastaría que se desfasaran para que
   * volver empezara a dar 400.
   */
  readonly anterior: string | null;
}

/** El BFF respondió con un error entendible para el usuario. */
export class ErrorDeApi extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly contexto?: unknown,
  ) {
    super(message);
    this.name = 'ErrorDeApi';
  }
}

async function pedir<T>(
  ruta: string,
  init?: RequestInit,
  cabeceras: Readonly<Record<string, string>> = {},
): Promise<T> {
  const res = await fetch(`/api${ruta}`, {
    ...init,
    headers: cabecerasDeApi({ 'Content-Type': 'application/json', ...cabeceras }),
  });

  const cuerpo: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle =
      typeof cuerpo === 'object' && cuerpo !== null && 'error' in cuerpo
        ? String((cuerpo as { error: unknown }).error)
        : `Error ${res.status}`;
    throw new ErrorDeApi(detalle, res.status, cuerpo);
  }
  return cuerpo as T;
}

export const api = {
  /** Arranca una cotización nueva y devuelve el primer paso. Pide reCAPTCHA. */
  crear: async () =>
    pedir<EstadoCotizacion>('/cotizaciones', { method: 'POST' }, await cabeceraRecaptcha('cotizar')),

  /** Completa el paso actual. */
  avanzar: (id: string, valores: Record<string, string>) =>
    pedir<EstadoCotizacion>(`/cotizaciones/${id}/pasos`, {
      method: 'POST',
      body: JSON.stringify({ valores }),
    }),

  /** Toma una salida alternativa del paso: «Cotizar sin patente», «Otra marca». */
  ir: (id: string, step: string) =>
    pedir<EstadoCotizacion>(`/cotizaciones/${id}/ir`, {
      method: 'POST',
      body: JSON.stringify({ step }),
    }),

  /** Trae la lista de un paso con buscador. */
  opciones: (id: string) =>
    pedir<{ opciones: ChoiceOption[] }>(`/cotizaciones/${id}/opciones`).then((r) => r.opciones),

  /** Foto del estado de la cotización; se pide repetidamente. */
  resultados: (id: string) => pedir<Quotations>(`/cotizaciones/${id}/resultados`),

  /** Elige un plan y devuelve todo lo capturado, para armar la contratación. */
  elegir: (id: string, quote: Quote) =>
    pedir<{
      elegido: unknown;
      valores: Record<string, string>;
      /** El auto que el motor encontró; sólo viene si se cotizó con patente. */
      vehiculo?: VehiculoDelMotor;
    }>(`/cotizaciones/${id}/elegir`, {
      method: 'POST',
      body: JSON.stringify({
        code: quote.code,
        insurance: quote.company,
        plan: quote.plan,
      }),
    }),
};
