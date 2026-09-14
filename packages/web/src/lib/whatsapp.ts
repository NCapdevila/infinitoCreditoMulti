import type { Contratacion } from './contratacion.ts';

/**
 * Contacto por WhatsApp.
 *
 * El número se guarda en formato internacional sin signos, que es lo que espera
 * `wa.me`: 54 (país) + 9 (celular) + 11 (área) + el número.
 */
const NUMERO = '5491167928789';

/** Abre WhatsApp con un mensaje que le ahorra al asesor preguntar lo obvio. */
export function abrirWhatsapp(mensaje?: string): void {
  const url = new URL(`https://wa.me/${NUMERO}`);
  if (mensaje !== undefined && mensaje !== '') url.searchParams.set('text', mensaje);
  window.open(url.toString(), '_blank', 'noopener,noreferrer');
}

/** Mensaje con la cobertura elegida, para el contacto durante la contratación. */
export function mensajeDeCobertura(datos: Contratacion): string {
  const { cobertura, vehiculo, contacto } = datos;
  const auto = `${vehiculo.marca} ${vehiculo.version} ${vehiculo.anio}`.trim();
  return (
    `Hola, soy ${contacto.nombre || 'un cliente'} y estoy contratando un seguro por la web. ` +
    `Elegí ${cobertura.compania} - ${cobertura.plan} para mi ${auto}.`
  );
}
