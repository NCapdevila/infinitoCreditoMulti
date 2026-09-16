import { ErrorDeCliente, ErrorHttp } from './errores.js';
import type { MotorSession, Step } from './motor/types.js';

/**
 * Las cotizaciones en curso.
 *
 * Viven en memoria: alcanza para un único proceso. Persistirlas es lo que pide
 * el borrador del wizard (spec 7.10) y es el próximo paso natural; mientras
 * tanto, reiniciar el BFF corta las cargas que estén a mitad de camino.
 */

export interface Cotizacion {
  session: MotorSession;
  paso: Step;
  /** Lo que el usuario fue eligiendo, para poder rearmar la contratación. */
  valores: Record<string, string>;
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
}

/** Una cotización sin tocar durante media hora ya no le sirve a nadie. */
export const TTL_MS = 30 * 60 * 1000;

export class Cotizaciones {
  private readonly todas = new Map<string, Cotizacion>();

  guardar(id: string, cotizacion: Cotizacion): void {
    this.todas.set(id, cotizacion);
  }

  /**
   * Trae una cotización para operarla desde `origen`.
   *
   * Que no exista y que haya expirado son lo mismo para quien la pide. Que sea
   * de otra agencia, no: es un 403, porque el pedido está autenticado pero no
   * tiene permiso sobre eso.
   */
  buscar(id: string | undefined, origen: string): Cotizacion {
    const cotizacion = id === undefined ? undefined : this.todas.get(id);
    if (cotizacion === undefined) {
      throw new ErrorDeCliente('la cotización no existe o expiró');
    }
    if (cotizacion.origen !== origen) {
      throw new ErrorHttp(403, 'la cotización no pertenece a este sitio');
    }
    return cotizacion;
  }

  /** Saca las vencidas para que el Map no crezca sin techo. */
  limpiar(ahora: number = Date.now()): void {
    const limite = ahora - TTL_MS;
    for (const [id, cotizacion] of this.todas) {
      if (cotizacion.creada < limite) this.todas.delete(id);
    }
  }
}
