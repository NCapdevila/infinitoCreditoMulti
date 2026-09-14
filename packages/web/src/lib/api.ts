import type { ChoiceOption, Step } from '@infinito/bff/motor/types';
import type { Quotations, Quote } from '@infinito/bff/motor/quotations';

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

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${ruta}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
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
  /** Arranca una cotización nueva y devuelve el primer paso. */
  crear: () => pedir<EstadoCotizacion>('/cotizaciones', { method: 'POST' }),

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
    pedir<{ elegido: unknown; valores: Record<string, string> }>(`/cotizaciones/${id}/elegir`, {
      method: 'POST',
      body: JSON.stringify({
        code: quote.code,
        insurance: quote.company,
        plan: quote.plan,
      }),
    }),
};
