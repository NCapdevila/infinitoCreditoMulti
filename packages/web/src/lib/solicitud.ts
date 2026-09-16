import type { Solicitud } from '@infinito/bff/correo';
import { CONDICIONES_FISCALES, SEXOS, TOMAS, type Contratacion } from './contratacion.ts';
import { comoAdjunto, esPdf } from './imagenes.ts';
import { datosDeConstancia } from './certificado.ts';
import { cabecerasDeApi } from './pase.ts';
import { cabeceraRecaptcha } from './recaptcha.ts';

/**
 * Arma el correo con todo lo capturado y lo manda.
 *
 * Es el único registro de la operación: no se guarda en ninguna base. Por eso
 * el mensaje incluye todo lo necesario para emitir sin tener que volver a
 * pedirle nada al vendedor.
 */

const etiqueta = (opciones: readonly { value: string; label: string }[], value: string) =>
  opciones.find((o) => o.value === value)?.label ?? (value === '' ? '—' : value);

const oGuion = (valor: string) => (valor.trim() === '' ? '—' : valor);

function seccionesDe(datos: Contratacion): Solicitud['secciones'] {
  const { agencia, asegurado, domicilio, vehiculo, cobertura, medioDePago, fotos } = datos;
  const esJuridica = asegurado.tipoPersona === 'JURIDICA';

  const pago: (readonly [string, string])[] =
    medioDePago.tipo === 'TARJETA'
      ? [
          ['Medio', 'Tarjeta de crédito'],
          ['Banco', oGuion(medioDePago.banco)],
          ['Tarjeta', oGuion(medioDePago.marcaTarjeta)],
          // Va el número completo por decisión del negocio; ver la advertencia
          // de PCI-DSS en `correo.ts` del BFF.
          ['Número', oGuion(medioDePago.numero)],
          ['Vencimiento', oGuion(medioDePago.vencimiento)],
        ]
      : [
          ['Medio', 'CBU'],
          ['Banco', oGuion(medioDePago.banco)],
          ['CBU', oGuion(medioDePago.cbu)],
          ['Tipo de cuenta', oGuion(medioDePago.tipoCuenta)],
        ];

  return [
    {
      titulo: 'Cobertura elegida',
      filas: [
        ['Compañía', cobertura.compania],
        ['Cobertura', `[${cobertura.code}] ${cobertura.plan}`],
        ['Costo mensual', cobertura.costoMensual],
        ...(cobertura.sumaAsegurada !== undefined
          ? ([['Suma asegurada', cobertura.sumaAsegurada]] as const)
          : []),
      ],
    },
    {
      titulo: 'Asegurado',
      filas: [
        ['Tipo', esJuridica ? 'Persona jurídica' : 'Persona física'],
        ...(esJuridica
          ? ([
              ['Razón social', oGuion(asegurado.razonSocial)],
              ['CUIT', oGuion(asegurado.cuit)],
              ['Contacto', oGuion(asegurado.nombreCompleto)],
            ] as const)
          : ([
              ['Nombre', oGuion(asegurado.nombreCompleto)],
              ['DNI', oGuion(asegurado.dni)],
            ] as const)),
        ['Sexo', etiqueta(SEXOS, asegurado.sexo)],
        ['Condición fiscal', etiqueta(CONDICIONES_FISCALES, asegurado.condicionFiscal)],
        ['E-mail', oGuion(asegurado.email)],
        ['Teléfono', oGuion(asegurado.telefono)],
      ],
    },
    {
      titulo: 'Domicilio del vehículo',
      filas: [
        ['Calle', oGuion(domicilio.calle)],
        ['Altura', oGuion(domicilio.altura)],
        ['Piso / Depto', oGuion(domicilio.pisoDepto)],
        ['Localidad', `${domicilio.localidad} (CP ${domicilio.cp})`],
      ],
    },
    {
      titulo: 'Vehículo',
      filas: [
        ['Marca', vehiculo.marca],
        ['Modelo', vehiculo.modelo],
        ['Versión', vehiculo.version],
        ['Año', String(vehiculo.anio)],
        ['Patente', vehiculo.esCeroKm ? '0 KM' : oGuion(vehiculo.patente)],
        ['Motor', oGuion(vehiculo.motor)],
        ['Chasis', oGuion(vehiculo.chasis)],
        ...(vehiculo.esCeroKm
          ? ([['No rodamiento', datos.documentoNoRodamiento ?? 'sin adjuntar']] as const)
          : ([['Fotos', `${fotos.length} de ${TOMAS.length} adjuntas`]] as const)),
      ],
    },
    { titulo: 'Medio de pago', filas: pago },
    {
      titulo: 'Agencia',
      filas: [
        ['Agencia', oGuion(agencia.nombre)],
        ['Vendedor', oGuion(agencia.vendedor)],
        ['Teléfono', oGuion(agencia.telefono)],
        ['E-mail', oGuion(agencia.email)],
      ],
    },
  ];
}

/** Las fotos ya vienen comprimidas desde la carga. */
function adjuntosDe(datos: Contratacion): Solicitud['adjuntos'] {
  const extension = (dataUrl: string) => (esPdf(dataUrl) ? 'pdf' : 'jpg');
  return TOMAS.flatMap((toma) => {
    const foto = datos.fotos.find((f) => f.tipo === toma.tipo);
    if (foto === undefined) return [];
    // Se translitera en vez de borrar los acentos: si no, «Cédula verde o
    // título» llega como «c-dula-verde-o-t-tulo».
    const nombre = toma.label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return [comoAdjunto(`${nombre}.${extension(foto.previewUrl)}`, foto.previewUrl)];
  });
}

export interface ResultadoSolicitud {
  readonly enviado: boolean;
  /** Id del mensaje: sin base de datos, es lo que permite rastrear la operación. */
  readonly referencia?: string;
  /** Si el comprador recibió su constancia. No bloquea la emisión. */
  readonly constanciaAlCliente?: { readonly enviada: boolean; readonly error?: string };
}

/** Manda la solicitud. Lanza si el servidor no pudo enviarla. */
export async function enviarSolicitud(datos: Contratacion): Promise<ResultadoSolicitud> {
  const patente = datos.vehiculo.esCeroKm ? '0 KM' : datos.vehiculo.patente;
  const asunto = `Solicitud de emisión · ${datos.cobertura.compania} · ${patente}`;

  // El comprador recibe su constancia en el correo que dejó al cotizar.
  const emailCliente = datos.asegurado.email !== '' ? datos.asegurado.email : datos.contacto.email;
  const nombreCliente =
    datos.asegurado.nombreCompleto !== ''
      ? datos.asegurado.nombreCompleto
      : datos.contacto.nombre;

  const res = await fetch('/api/solicitud', {
    method: 'POST',
    headers: cabecerasDeApi({
      'Content-Type': 'application/json',
      ...(await cabeceraRecaptcha('solicitud')),
    }),
    body: JSON.stringify({
      certificado: datosDeConstancia(datos),
      correo: {
        asunto,
        secciones: seccionesDe(datos),
        adjuntos: adjuntosDe(datos),
        emailCliente,
        nombreCliente,
      },
    }),
  });

  const cuerpo: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle =
      typeof cuerpo === 'object' && cuerpo !== null && 'error' in cuerpo
        ? String((cuerpo as { error: unknown }).error)
        : 'No pudimos enviar la solicitud.';
    throw new Error(detalle);
  }

  return cuerpo as ResultadoSolicitud;
}
