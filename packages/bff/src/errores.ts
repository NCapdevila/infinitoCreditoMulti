/**
 * Errores que terminan en una respuesta HTTP con su código.
 *
 * El router los atrapa todos en un mismo lugar y contesta `status` con el
 * mensaje: así un módulo que no sabe nada de HTTP —el almacén de cotizaciones,
 * el pase— puede rechazar una operación con el código correcto.
 */
export class ErrorHttp extends Error {
  constructor(
    readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorHttp';
  }
}

/** El pedido está mal formado o no tiene sentido en el estado actual. */
export class ErrorDeCliente extends ErrorHttp {
  constructor(mensaje: string) {
    super(400, mensaje);
    this.name = 'ErrorDeCliente';
  }
}
