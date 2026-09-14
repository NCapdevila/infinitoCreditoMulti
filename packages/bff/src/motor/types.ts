/**
 * Modelo normalizado del motor de cotización (infinito.foxia.ar).
 *
 * El motor es Django + htmx: cada paso se sirve como un fragmento de HTML que
 * reemplaza `#block-steps`. No expone JSON. Estos tipos son el contrato que el
 * BFF le ofrece al front, de modo que ninguna pantalla dependa del markup.
 */

/** Id de paso tal como lo usa el motor: "1", "2cp", "2sp", "4sp"… */
export type StepId = string;

/** Todo lo necesario para emitir el próximo request al motor. */
export interface MotorSession {
  /** UUID del embed (identifica al broker/producto). */
  readonly uuid: string;
  /** Token de sesión que viaja en el query string como `s=`. */
  readonly s: string;
  /** CSRF de Django, rota en cada fragmento. */
  readonly csrf: string;
}

/** Campo de entrada de un paso. */
export interface TextField {
  readonly name: string;
  /** `type` del input en el motor: text, date, email… Define el teclado móvil. */
  readonly type: string;
  /** `aria-label` del motor; es el único rótulo que traen estos campos. */
  readonly label?: string;
  readonly placeholder?: string;
  readonly maxLength?: number;
  /** Valor con el que el motor lo entrega, si viene prellenado. */
  readonly value?: string;
}

/** Opción de un paso de selección (marca, modelo, provincia…). */
export interface ChoiceOption {
  readonly value: string;
  readonly label: string;
  readonly iconUrl?: string;
}

/**
 * Cómo se completa el paso.
 *
 * En un paso de texto lo dispara el botón primario; en uno de selección, el
 * radio mismo (el motor postea on-change, sin botón). El front no necesita
 * saber cuál de las dos cosas era en el HTML.
 */
export interface Submit {
  /** Rótulo del botón, si el paso tiene uno. */
  readonly label?: string;
  readonly method: 'GET' | 'POST';
  /** Paso que atiende el request. */
  readonly step: StepId;
  /** Valor del hidden `next`: a dónde lleva el motor si el POST es válido. */
  readonly next?: StepId;
}

/** Salida alternativa del paso: "Cotizar sin patente", "Otra marca". */
export interface Action {
  readonly label: string;
  readonly method: 'GET' | 'POST';
  readonly step: StepId;
}

interface StepBase {
  readonly id: StepId;
  /** Texto del `.tag`, ej. "COMENCEMOS". */
  readonly eyebrow?: string;
  readonly title: string;
  readonly description?: string;
  /**
   * Aclaración corta del motor («*Influye en el precio»).
   *
   * Va en violeta bajo el título, separada de la descripción: son cosas
   * distintas y el motor las marca distinto.
   */
  readonly nota?: string;
  readonly submit: Submit;
  /** Salidas que no son el camino principal. */
  readonly actions: readonly Action[];
}

/**
 * Paso que pide datos escritos.
 *
 * Casi siempre es un campo, pero el celular son tres —prefijo, característica y
 * número— así que el modelo los trata como una lista y el front no necesita
 * conocer el caso especial.
 */
export interface TextInputStep extends StepBase {
  readonly kind: 'text-input';
  readonly fields: readonly TextField[];
}

/**
 * De dónde salen las opciones cuando el motor no las manda en el fragmento.
 *
 * Los pasos con buscador —modelo, versión, provincia, localidad— llegan con la
 * lista vacía y un `hx-trigger="load"` que la pide a un endpoint aparte. El
 * front no debería enterarse de esa diferencia: `MotorClient.loadOptions` la
 * resuelve.
 */
export interface OptionsSource {
  /** Ruta del endpoint, ej. "/embed/models". */
  readonly path: string;
}

/** Paso que pide elegir de una lista. */
export interface ChoiceStep extends StepBase {
  readonly kind: 'choice';
  /** Nombre del campo a postear ("brand", "model", "province"…). */
  readonly name: string;
  /** Opciones que vinieron en el fragmento; vacío si hay que pedirlas. */
  readonly options: readonly ChoiceOption[];
  /** Presente cuando la lista se pide aparte. */
  readonly optionsSource?: OptionsSource;
  /** El motor renderiza un buscador sobre la lista. */
  readonly searchable: boolean;
}

/**
 * Pantalla que informa un resultado y ofrece seguir, sin pedir nada.
 *
 * Es lo que devuelve cotizar con patente: «¿Este es tu vehículo?» con los datos
 * encontrados —o el aviso de que no se encontraron— y un botón para continuar.
 * No tiene formulario, pero sí salidas: por eso no es una pantalla de espera.
 */
export interface InfoStep {
  readonly kind: 'info';
  readonly id: StepId;
  readonly eyebrow?: string;
  readonly title: string;
  /** Líneas del cuerpo: la patente consultada, los datos del vehículo. */
  readonly detalle: readonly string[];
  readonly actions: readonly Action[];
}

/**
 * La pantalla de espera: el motor ya tiene todo y está cotizando.
 *
 * No tiene formulario, así que no es un paso que el usuario complete. A partir
 * de acá se piden resultados con `pollQuotations`.
 */
export interface WaitingStep {
  readonly kind: 'waiting';
  readonly id: StepId;
  readonly title: string;
  readonly description?: string;
}

export type Step = TextInputStep | ChoiceStep | InfoStep | WaitingStep;

/** Un paso, más la sesión con la que se lo pidió. */
export interface ParsedStep {
  readonly session: MotorSession;
  readonly step: Step;
}

/**
 * El markup del motor no es un contrato: puede cambiar sin aviso.
 * El parser falla con este error en vez de devolver datos incompletos,
 * para que un cambio de markup se note como caída y no como dato corrupto.
 */
export class MotorParseError extends Error {
  constructor(
    message: string,
    readonly context: { step?: StepId; selector?: string; html?: string },
  ) {
    const where = context.step ? ` [step=${context.step}]` : '';
    const what = context.selector ? ` (selector: ${context.selector})` : '';
    super(`El markup del motor cambió${where}: ${message}${what}`);
    this.name = 'MotorParseError';
  }
}
