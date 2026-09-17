import { parseOptionList, parseStep } from './parse.js';
import { parseQuotations, type Quotations } from './quotations.js';
import {
  MotorParseError,
  type ChoiceOption,
  type MotorSession,
  type OptionsSource,
  type ParsedStep,
  type StepId,
} from './types.js';

/**
 * Cliente del motor de cotización.
 *
 * Habla htmx del lado de afuera y devuelve el modelo normalizado. Es el único
 * lugar del BFF que conoce la forma de los endpoints; el resto trabaja con
 * `Step`.
 */

export interface MotorConfig {
  /** Origen del motor, sin barra final. */
  readonly baseUrl: string;
  /** UUID del embed. */
  readonly uuid: string;
  /** Timeout por request, en ms. */
  readonly timeoutMs?: number;
}

/** El motor respondió, pero con un status que no permite seguir. */
export class MotorHttpError extends Error {
  constructor(readonly status: number, readonly url: string) {
    super(`El motor respondió ${status} en ${url}`);
    this.name = 'MotorHttpError';
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Reintentos ante fallas transitorias del motor.
 *
 * El motor está detrás de Cloudflare y devuelve 520/522/524 cuando el origen
 * tarda o se cae un momento. Sin reintentar, un hipo de un segundo tira abajo
 * una cotización que el vendedor ya empezó a cargar.
 */
const INTENTOS = 3;
/** Sólo se reintenta lo que puede arreglarse solo. */
const TRANSITORIOS = new Set([429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MotorClient {
  constructor(private readonly config: MotorConfig) {}

  /** URL de un paso. `partial` trae el fragmento; la otra, la página entera. */
  private url(step: StepId, s?: string, partial = true): string {
    const path = partial ? '/embed/partial/infinitocredito' : '/embed/infinitocredito';
    const query = new URLSearchParams();
    if (s !== undefined) query.set('s', s);
    query.set('step', step);
    return `${this.config.baseUrl}${path}/${this.config.uuid}?${query}`;
  }

  private async request(url: string, init?: RequestInit): Promise<string> {
    let ultimoError: unknown;

    for (let intento = 1; intento <= INTENTOS; intento += 1) {
      try {
        const response = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
          headers: {
            // Sin esto Django sirve la página completa en vez del fragmento.
            'HX-Request': 'true',
            'HX-Target': 'block-steps',
            ...init?.headers,
          },
        });

        if (response.ok) return await response.text();

        // Un 4xx no se arregla repitiendo: es un problema del pedido.
        if (!TRANSITORIOS.has(response.status)) {
          throw new MotorHttpError(response.status, url);
        }
        ultimoError = new MotorHttpError(response.status, url);
        console.warn(`[motor] ${response.status} en ${url} · intento ${intento}/${INTENTOS}`);
      } catch (error) {
        // Un timeout o una conexión cortada también se reintentan.
        if (error instanceof MotorHttpError && !TRANSITORIOS.has(error.status)) throw error;
        ultimoError = error;
        console.warn(`[motor] falló ${url} · intento ${intento}/${INTENTOS}`);
      }

      if (intento < INTENTOS) await esperar(intento * 700);
    }

    throw ultimoError instanceof Error
      ? ultimoError
      : new MotorHttpError(0, url);
  }

  /**
   * Abre una cotización nueva.
   *
   * El token de sesión y el CSRF nacen acá: hay que leerlos de la página
   * inicial, no se pueden inventar.
   */
  async start(): Promise<ParsedStep> {
    const url = `${this.config.baseUrl}/embed/infinitocredito/${this.config.uuid}`;
    return parseStep(await this.request(url), this.config.uuid, '1', this.config.baseUrl);
  }

  /**
   * Trae un paso sin completar el anterior (las salidas alternativas).
   *
   * Casi todas se piden con un GET al fragmento. Las que el motor postea usan
   * otra URL —`/embed/step5sp/…`, la misma forma que elegir un plan— y además
   * devuelven otra pantalla: pedir `?step=5sp` por GET trae la misma página
   * pero sin el año y sin el botón de contacto, que es justo lo único que esa
   * pantalla ofrece hacer. Por eso el método viaja en la acción.
   */
  async goTo(
    step: StepId,
    session: MotorSession,
    method: 'GET' | 'POST' = 'GET',
  ): Promise<ParsedStep> {
    const url =
      method === 'POST'
        ? `${this.config.baseUrl}/embed/step${step}/infinitocredito/${this.config.uuid}?s=${encodeURIComponent(session.s)}`
        : this.url(step, session.s);
    const html = await this.request(
      url,
      method === 'POST'
        ? {
            method: 'POST',
            headers: {
              Referer: `${this.config.baseUrl}/embed/infinitocredito/${this.config.uuid}`,
            },
          }
        : undefined,
    );
    return parseStep(html, this.config.uuid, step, this.config.baseUrl, session);
  }

  /**
   * Completa un paso y devuelve el siguiente.
   *
   * El CSRF del `session` recibido se consume en este POST: la respuesta trae
   * uno nuevo, que es el que hay que usar de acá en adelante.
   *
   * `next` viene del propio paso (`submit.next`): es lo que le dice al motor
   * cuál es la pantalla siguiente.
   */
  async submit(
    step: StepId,
    session: MotorSession,
    values: Readonly<Record<string, string>>,
    next = '',
  ): Promise<ParsedStep> {
    // `next` es un hidden del formulario y el motor lo usa para decidir a dónde
    // ir: sin él, re-renderiza el mismo paso y el usuario ve que no pasa nada.
    // El front original lo manda siempre, vacío cuando no tiene valor.
    const body = new URLSearchParams({
      csrfmiddlewaretoken: session.csrf,
      next,
      ...values,
    });
    const url = this.url(step, session.s);

    const html = await this.request(url, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Django valida el Referer en POST sobre HTTPS.
        Referer: this.url(step, session.s, false),
      },
    });

    // El paso que devuelve el motor no siempre es el `next` declarado: si la
    // validación falla, re-renderiza el mismo paso con el error.
    return parseStep(html, this.config.uuid, undefined, this.config.baseUrl, session);
  }

  /**
   * Trae las opciones de un paso con buscador.
   *
   * El motor sirve la lista entera y filtra en el cliente —831 localidades en
   * el caso extremo—, así que `search` casi siempre va vacío. Se acepta igual
   * porque el endpoint lo admite y conviene tenerlo para listas grandes.
   */
  async loadOptions(
    source: OptionsSource,
    session: MotorSession,
    search = '',
  ): Promise<ChoiceOption[]> {
    const url = `${this.config.baseUrl}${source.path}?s=${encodeURIComponent(session.s)}`;
    const html = await this.request(url, {
      method: 'POST',
      body: new URLSearchParams({ csrfmiddlewaretoken: session.csrf, search }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${this.config.baseUrl}/embed/infinitocredito/${this.config.uuid}`,
      },
    });
    return parseOptionList(html, this.config.baseUrl);
  }

  /**
   * Cierra los datos y dispara la cotización contra las compañías.
   *
   * A partir de acá los resultados se piden con `pollQuotations`.
   */
  async save(session: MotorSession): Promise<void> {
    const url = `${this.config.baseUrl}/embed/save/infinitocredito/${this.config.uuid}?s=${encodeURIComponent(session.s)}`;
    await this.request(url, {
      method: 'POST',
      body: new URLSearchParams({ csrfmiddlewaretoken: session.csrf }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${this.config.baseUrl}/embed/infinitocredito/${this.config.uuid}`,
      },
    });
  }

  /**
   * Elige un plan: es la frontera con la etapa 3.
   *
   * `code` viaja como string opaco a propósito — hay códigos alfanuméricos y
   * con ceros a la izquierda.
   */
  async elegirPlan(
    session: MotorSession,
    eleccion: { code: string; insurance: string; plan: string },
  ): Promise<void> {
    const url = `${this.config.baseUrl}/embed/step4_1/infinitocredito/${this.config.uuid}?s=${encodeURIComponent(session.s)}`;
    await this.request(url, {
      method: 'POST',
      body: new URLSearchParams({
        code: eleccion.code,
        insurance: eleccion.insurance,
        insurance_plan: eleccion.plan,
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${this.config.baseUrl}/embed/infinitocredito/${this.config.uuid}`,
      },
    });
  }

  /** Pide una foto del estado actual de la cotización. */
  async quotations(session: MotorSession): Promise<Quotations> {
    const url = `${this.config.baseUrl}/embed/quotations/${session.s}`;
    return parseQuotations(await this.request(url));
  }

  /**
   * Pollea hasta que los resultados se estabilicen.
   *
   * Entrega resultados parciales por `onUpdate` para que la pantalla de espera
   * pueda ir mostrando lo que llega, igual que hace el multi hoy.
   */
  async pollQuotations(session: MotorSession, options: PollOptions = {}): Promise<PollResult> {
    const { intervalMs, stableRounds, timeoutMs } = { ...POLL_DEFAULTS, ...options };
    const startedAt = Date.now();

    let quotations = await this.quotations(session);
    options.onUpdate?.(quotations);

    let previousTotal = quotations.total;
    let unchanged = 0;
    let rounds = 1;

    while (Date.now() - startedAt < timeoutMs) {
      // Un total estable con al menos un resultado es lo más cerca de "listo"
      // que se puede estar sin que el motor lo diga.
      if (unchanged >= stableRounds && quotations.total > 0) {
        return { quotations, stoppedBy: 'stable', elapsedMs: Date.now() - startedAt, rounds };
      }

      await sleep(intervalMs);
      quotations = await this.quotations(session);
      options.onUpdate?.(quotations);
      rounds += 1;

      unchanged = quotations.total === previousTotal ? unchanged + 1 : 0;
      previousTotal = quotations.total;
    }

    return { quotations, stoppedBy: 'timeout', elapsedMs: Date.now() - startedAt, rounds };
  }
}

export { MotorParseError };

/**
 * Opciones del polling de cotizaciones.
 *
 * El motor no avisa cuándo terminó: sirve resultados parciales cada vez que se
 * lo pide y nunca dice "listo". El front htmx original pollea cada 2 s para
 * siempre. Acá el corte es por estabilidad — si el total no se mueve durante
 * `stableRounds` vueltas, se da por completo — con un tope duro de tiempo.
 */
export interface PollOptions {
  /** Cadencia. El front original usa 2 s. */
  readonly intervalMs?: number;
  /** Vueltas sin cambios para darlo por terminado. */
  readonly stableRounds?: number;
  /** Tope duro. Una cotización real tardó ~22 s en completarse. */
  readonly timeoutMs?: number;
  /** Se llama con cada foto parcial, para ir pintando resultados. */
  readonly onUpdate?: (quotations: Quotations) => void;
}

const POLL_DEFAULTS = {
  intervalMs: 2_000,
  // El motor responde por olas y se queda quieto hasta 6 s entre una y otra:
  // con menos de 5 vueltas se corta a mitad de camino y se pierden ofertas.
  stableRounds: 5,
  timeoutMs: 60_000,
} as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface PollResult {
  readonly quotations: Quotations;
  /** Por qué se dejó de pedir. `timeout` significa que puede faltar alguna compañía. */
  readonly stoppedBy: 'stable' | 'timeout';
  readonly elapsedMs: number;
  readonly rounds: number;
}

