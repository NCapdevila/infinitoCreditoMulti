import type { DatosCertificado } from '@infinito/bff/certificado';
import type { Contratacion } from './contratacion.ts';

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
export async function descargarConstancia(datos: Contratacion): Promise<void> {
  const res = await fetch('/api/certificado', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datosDeConstancia(datos)),
  });
  if (!res.ok) throw new Error('No pudimos generar la constancia.');

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
