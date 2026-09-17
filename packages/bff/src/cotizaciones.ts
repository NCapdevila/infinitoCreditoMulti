import { ErrorDeCliente, ErrorHttp } from './errores.js';
import type { MotorSession, Step, VehiculoDelMotor } from './motor/types.js';

/**
 * Las cotizaciones en curso.
 *
 * Viven en memoria: alcanza para un único proceso. Persistirlas es lo que pide
 * el borrador del wizard (spec 7.10) y es el próximo paso natural; mientras
 * tanto, reiniciar el BFF corta las cargas que estén a mitad de camino.
 */

/**
 * El plan que eligió el vendedor, tal como lo cotizó el motor.
 *
 * Se guarda al elegir, sacado de los resultados del motor y no de lo que mande
 * el front: es lo que después va a la constancia y al correo, y si se le
 * creyera al front, cualquiera podría emitir una constancia de Zurich con la
 * suma asegurada que quisiera.
 */
export interface PlanElegido {
  readonly code: string;
  readonly compania: string;
  readonly plan: string;
  readonly costoMensual: string;
  readonly sumaAsegurada?: string;
}

export interface Cotizacion {
  session: MotorSession;
  paso: Step;
  /** Lo que el usuario fue eligiendo, para poder rearmar la contratación. */
  valores: Record<string, string>;
  /**
   * El auto que el motor encontró por patente, si se cotizó así.
   *
   * Cotizando con patente no hay pasos de marca, modelo, año ni versión: el
   * motor los resuelve y los muestra una sola vez, en «¿Este es tu vehículo?».
   * Se guarda ahí porque después no vuelve a estar en ningún lado, y sin él la
   * contratación seguía con el auto de la cotización anterior —o con el de
   * ejemplo— y la constancia salía con otro vehículo.
   */
  vehiculo?: VehiculoDelMotor;
  /** El motor ya está cotizando: se piden resultados, no pasos. */
  cotizando: boolean;
  /**
   * Los pasos por los que ya pasó esta cotización, en orden.
   *
   * Es lo que hace posible el botón de volver. El motor lo resuelve con
   * `history.back()` del navegador, que no le sirve a un front que es una sola
   * página; acá el camino recorrido es del servidor, que es el único que puede
   * autorizar un paso atrás sin que el front invente ids.
   */
  visitados: string[];
  /**
   * La agencia desde la que se creó, según su pase.
   *
   * Una cotización se opera sólo con un pase del mismo origen: el id viaja en
   * cada llamada y, sin esto, conocerlo alcanzaba para seguir una carga ajena
   * desde otro sitio.
   */
  readonly origen: string;
  readonly creada: number;
  /** Última vez que se la usó: el vencimiento se cuenta desde acá. */
  usada: number;
  plan?: PlanElegido;
  /**
   * En qué anda la solicitud de emisión.
   *
   * `enviando` existe para que dos pedidos simultáneos no manden dos correos:
   * se marca antes de enviar, no después, y se libera si el envío falla.
   */
  solicitud: 'pendiente' | 'enviando' | 'enviada';
}

/**
 * Cuánto dura una cotización sin usarse.
 *
 * Mientras se cotiza, media hora: nadie deja la pantalla de marcas abierta más
 * que eso. Con un plan elegido, dos horas, porque lo que sigue es la carga de
 * la contratación y las nueve fotos, que sí puede llevar un rato largo, con
 * idas y vueltas a buscar la cédula. Dos horas es también lo que dura el pase:
 * más no serviría, porque para seguir habría que recargar la página igual.
 *
 * Se cuenta desde el último uso y no desde que se creó. Contado desde la
 * creación, una cotización que tardó veinte minutos en elegir plan vencía a
 * los diez de empezar a cargar la contratación.
 */
export const TTL_COTIZANDO_MS = 30 * 60 * 1000;
export const TTL_CON_PLAN_MS = 2 * 60 * 60 * 1000;

const venceEn = (c: Cotizacion) =>
  c.usada + (c.plan !== undefined ? TTL_CON_PLAN_MS : TTL_COTIZANDO_MS);

export class Cotizaciones {
  private readonly todas = new Map<string, Cotizacion>();

  guardar(id: string, cotizacion: Cotizacion): void {
    this.todas.set(id, cotizacion);
  }

  /**
   * Trae una cotización para operarla desde `origen`, y la da por usada.
   *
   * Que no exista y que haya vencido son lo mismo para quien la pide. Que sea
   * de otra agencia, no: es un 403, porque el pedido está autenticado pero no
   * tiene permiso sobre eso.
   */
  buscar(id: string | undefined, origen: string, ahora: number = Date.now()): Cotizacion {
    const cotizacion = id === undefined || id === '' ? undefined : this.todas.get(id);
    if (cotizacion === undefined || venceEn(cotizacion) <= ahora) {
      throw new ErrorDeCliente('la cotización no existe o expiró');
    }
    if (cotizacion.origen !== origen) {
      throw new ErrorHttp(403, 'la cotización no pertenece a este sitio');
    }
    cotizacion.usada = ahora;
    return cotizacion;
  }

  /**
   * Una cotización lista para emitir: vigente, de esta agencia y con plan.
   *
   * Es la condición para armar una constancia o mandar una solicitud. Sin ella,
   * cualquiera con un pase podía emitir una constancia con los datos que
   * quisiera, sin haber cotizado nada.
   */
  paraEmitir(
    id: unknown,
    origen: string,
    ahora: number = Date.now(),
  ): Cotizacion & { plan: PlanElegido } {
    if (typeof id !== 'string' || id === '') throw new ErrorDeCliente('falta `cotizacionId`');
    const cotizacion = this.buscar(id, origen, ahora);
    if (cotizacion.plan === undefined) {
      throw new ErrorDeCliente('la cotización no tiene un plan elegido');
    }
    return cotizacion as Cotizacion & { plan: PlanElegido };
  }

  /** Toma el turno para mandar la solicitud. Una sola por cotización. */
  reservarSolicitud(cotizacion: Cotizacion): void {
    if (cotizacion.solicitud === 'enviada') {
      throw new ErrorHttp(409, 'La solicitud de esta cotización ya se envió.');
    }
    if (cotizacion.solicitud === 'enviando') {
      throw new ErrorHttp(409, 'La solicitud de esta cotización ya se está enviando.');
    }
    cotizacion.solicitud = 'enviando';
  }

  confirmarSolicitud(cotizacion: Cotizacion): void {
    cotizacion.solicitud = 'enviada';
  }

  /** El envío falló: se puede volver a intentar. */
  liberarSolicitud(cotizacion: Cotizacion): void {
    if (cotizacion.solicitud === 'enviando') cotizacion.solicitud = 'pendiente';
  }

  /** Saca las vencidas para que el Map no crezca sin techo. */
  limpiar(ahora: number = Date.now()): void {
    for (const [id, cotizacion] of this.todas) {
      if (venceEn(cotizacion) <= ahora) this.todas.delete(id);
    }
  }
}
