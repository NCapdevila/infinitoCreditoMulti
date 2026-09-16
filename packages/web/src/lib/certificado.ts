import type { DatosCertificado } from '@infinito/bff/certificado';
import type { Contratacion } from './contratacion.ts';
import { cabecerasDeApi } from './pase.ts';
import { cabeceraRecaptcha } from './recaptcha.ts';

/**
 * Arma la constancia a partir de lo capturado y la baja como PDF.
 *
 * El PDF lo genera el BFF: es el mismo documento que se adjunta al correo, así
 * que no puede haber dos versiones distintas del mismo papel.
 */
export function datosDeConstancia(datos: Contratacion): DatosCertificado {
  const { asegurado, domicilio, vehiculo, cobertura } = datos;
  const esJuridica = asegurado.tipoPersona === 'JURIDICA';

  const domicilioCompleto = [
    [domicilio.calle, domicilio.altura].filter((p) => p !== '').join(' '),
    domicilio.pisoDepto !== '' ? domicilio.pisoDepto : null,
    `(${domicilio.cp})`,
    domicilio.localidad.toUpperCase(),
  ]
    .filter((p) => p !== null && p !== '')
    .join(' ');

  return {
    asegurado: {
      nombre: (esJuridica ? asegurado.razonSocial : asegurado.nombreCompleto).toUpperCase(),
      documento: esJuridica ? asegurado.cuit : asegurado.dni,
      tipoDocumento: esJuridica ? 'CUIT' : 'DNI',
      domicilio: domicilioCompleto,
    },
    poliza: {
      aseguradora: cobertura.compania,
      fechaCarga: new Date(),
    },
    vehiculo: {
      descripcion: vehiculo.version,
      marca: vehiculo.marca,
      modelo: vehiculo.modelo,
      anio: vehiculo.anio,
      patente: vehiculo.esCeroKm ? '0 KM' : vehiculo.patente,
      motor: vehiculo.motor,
      chasis: vehiculo.chasis,
    },
    cobertura: {
      codigo: cobertura.code,
      detalle: cobertura.plan,
      ...(cobertura.sumaAsegurada !== undefined
        ? { sumaAsegurada: cobertura.sumaAsegurada }
        : {}),
    },
  };
}

/**
 * Pide la constancia al BFF y la baja.
 *
 * Se usa `fetch` y no un POST de formulario para poder mostrar un mensaje si el
 * servidor rechaza los datos: un formulario reemplazaría la pantalla con el
 * JSON del error.
 *
 * El object URL se libera con demora deliberada — soltarlo en el mismo tick
 * cancela la descarga, porque el navegador todavía no terminó de leer el blob.
 */
export async function descargarConstancia(
  datos: Contratacion,
  cotizacionId: string | undefined,
): Promise<void> {
  const res = await fetch('/api/certificado', {
    method: 'POST',
    headers: cabecerasDeApi({
      'Content-Type': 'application/json',
      ...(await cabeceraRecaptcha('constancia')),
    }),
    // Sin cotización con plan elegido el BFF no arma la constancia: la compañía
    // y la cobertura salen de ahí, no de estos datos.
    body: JSON.stringify({ cotizacionId, ...datosDeConstancia(datos) }),
  });
  if (!res.ok) {
    // El BFF explica qué pasó —la sesión venció, el reCAPTCHA no validó— y eso
    // le dice al vendedor si reintentar o recargar. Un texto fijo lo escondía.
    const cuerpo: unknown = await res.json().catch(() => ({}));
    const detalle =
      typeof cuerpo === 'object' && cuerpo !== null && 'error' in cuerpo
        ? String((cuerpo as { error: unknown }).error)
        : 'No pudimos generar la constancia.';
    throw new Error(detalle);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const patente = datos.vehiculo.patente !== '' ? datos.vehiculo.patente : 'emision';

  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `constancia-${patente}.pdf`;
  enlace.style.display = 'none';
  document.body.append(enlace);
  enlace.click();

  setTimeout(() => {
    enlace.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}
