import type { DatosCertificado } from './certificado.js';
import type { Cotizacion, PlanElegido } from './cotizaciones.js';
import type { VehiculoDelMotor } from './motor/types.js';
import type { Solicitud } from './correo.js';
import { ErrorDeCliente } from './errores.js';
import type { Quotations } from './motor/quotations.js';

/**
 * Qué se le cree al front y qué no, a la hora de emitir.
 *
 * La constancia y el correo se arman con datos que carga el vendedor —el
 * asegurado, el motor y el chasis, las fotos— y con datos que ya decidió el
 * motor: la compañía, la cobertura, la suma asegurada, el vehículo que se
 * cotizó. Los primeros sólo pueden venir del formulario. Los segundos se toman
 * de la cotización guardada acá, y lo que mande el front para esos campos se
 * ignora: es exactamente lo que alguien cambiaría para falsificar una
 * constancia.
 */

/**
 * Busca en los resultados del motor el plan que dice haber elegido el front.
 *
 * La terna `code` + compañía + plan es lo que identifica una elección en el
 * motor (ver `Quote`). Si no está entre los resultados, el front inventó un plan.
 */
export function planDeResultados(
  resultados: Quotations,
  eleccion: { readonly code: string; readonly insurance: string; readonly plan: string },
): PlanElegido | undefined {
  for (const grupo of resultados.groups) {
    for (const q of grupo.quotes) {
      if (q.code === eleccion.code && q.company === eleccion.insurance && q.plan === eleccion.plan) {
        return {
          code: q.code,
          compania: q.company,
          plan: q.plan,
          costoMensual: q.price.formatted,
          ...(q.insuredAmount !== undefined ? { sumaAsegurada: q.insuredAmount.formatted } : {}),
        };
      }
    }
  }
  return undefined;
}

type ValoresVehiculo = Partial<
  Pick<DatosCertificado['vehiculo'], 'marca' | 'modelo' | 'anio' | 'patente' | 'descripcion'>
>;

/**
 * Lo que el motor ya sabe del vehículo.
 *
 * Los dos caminos de cotización dejan cosas distintas, y ninguno deja todo:
 *
 * - **Sin patente** el vendedor elige marca, año, modelo y versión, y eso queda
 *   en `valores`. La patente no existe: la carga recién en la contratación.
 * - **Con patente** el motor resuelve el auto solo y esos pasos no ocurren:
 *   `valores` trae la patente y nada más. Qué auto es lo dijo una sola vez, en
 *   «¿Este es tu vehículo?», y de ahí sale `vehiculo`.
 *
 * Por eso se miran los dos. Antes se miraba sólo `valores`, y cotizar con
 * patente terminaba con la patente correcta al lado del auto equivocado: el que
 * hubiera quedado en el formulario del front.
 */
export function vehiculoDeValores(
  valores: Readonly<Record<string, string>>,
  delMotor?: VehiculoDelMotor,
): ValoresVehiculo {
  const resultado: { -readonly [K in keyof ValoresVehiculo]: ValoresVehiculo[K] } = {};
  const marca = valores['brand']?.trim() ?? delMotor?.marca;
  if (marca) resultado.marca = marca.toUpperCase();
  // Los valores del motor vienen compuestos con «|»: el rótulo va primero.
  // Cotizando con patente no hay modelo ni versión por separado —el motor manda
  // un solo texto—, así que los dos campos llevan esa descripción.
  const modelo = valores['model']?.split('|')[0]?.trim() ?? delMotor?.descripcion;
  if (modelo) resultado.modelo = modelo;
  const version = valores['version']?.split('|')[0]?.trim() ?? delMotor?.descripcion;
  if (version) resultado.descripcion = version;
  const anio = Number.parseInt(valores['year'] ?? '', 10);
  if (Number.isFinite(anio)) resultado.anio = anio;
  else if (delMotor !== undefined && delMotor.anio > 0) resultado.anio = delMotor.anio;
  const patente = valores['plate']?.trim();
  if (patente) resultado.patente = patente.toUpperCase();
  return resultado;
}

// ── lo que sí viene del formulario ─────────────────────────────────────

/** Un texto del formulario: recortado, sin saltos de línea y con largo máximo. */
function texto(valor: unknown, maximo = 200): string {
  if (typeof valor !== 'string') return '';
  return valor.replace(/[\r\n\t]+/g, ' ').trim().slice(0, maximo);
}

const objeto = (valor: unknown): Record<string, unknown> =>
  typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : {};

/**
 * La patente, reducida a lo que puede tener una patente.
 *
 * Va en el asunto del correo y en el nombre del PDF: sin esto, un salto de
 * línea o un `"` ahí adentro es una cabecera o un nombre de archivo ajeno.
 */
const patenteLimpia = (valor: string) =>
  valor.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);

/**
 * Los datos de la constancia: el formulario, corregido con la cotización.
 *
 * `poliza.fechaCarga` es la del servidor: la constancia dice cuándo se emitió, y
 * eso no es algo que decida el cliente.
 */
export function datosDeEmision(
  cuerpo: unknown,
  cotizacion: Pick<Cotizacion, 'valores' | 'vehiculo'> & { readonly plan: PlanElegido },
  ahora: Date = new Date(),
): DatosCertificado {
  const datos = objeto(cuerpo);
  const asegurado = objeto(datos['asegurado']);
  const vehiculo = objeto(datos['vehiculo']);

  const nombre = texto(asegurado['nombre'], 120);
  if (nombre === '') throw new ErrorDeCliente('faltan datos para armar la constancia');

  const delMotor = vehiculoDeValores(cotizacion.valores, cotizacion.vehiculo);
  const anioDelForm = typeof vehiculo['anio'] === 'number' ? vehiculo['anio'] : Number.NaN;

  const { plan } = cotizacion;
  return {
    asegurado: {
      nombre,
      documento: texto(asegurado['documento'], 20),
      tipoDocumento: asegurado['tipoDocumento'] === 'CUIT' ? 'CUIT' : 'DNI',
      domicilio: texto(asegurado['domicilio']),
    },
    poliza: { aseguradora: plan.compania, fechaCarga: ahora },
    vehiculo: {
      descripcion: delMotor.descripcion ?? texto(vehiculo['descripcion']),
      marca: delMotor.marca ?? texto(vehiculo['marca'], 60),
      modelo: delMotor.modelo ?? texto(vehiculo['modelo'], 80),
      anio: delMotor.anio ?? (Number.isInteger(anioDelForm) ? anioDelForm : 0),
      patente: patenteLimpia(delMotor.patente ?? texto(vehiculo['patente'], 20)),
      motor: texto(vehiculo['motor'], 40),
      chasis: texto(vehiculo['chasis'], 40),
    },
    cobertura: {
      codigo: plan.code,
      detalle: plan.plan,
      ...(plan.sumaAsegurada !== undefined ? { sumaAsegurada: plan.sumaAsegurada } : {}),
    },
  };
}

// ── el correo ──────────────────────────────────────────────────────────

/**
 * El asunto, que es lo primero que ve quien recibe la solicitud.
 *
 * Lo arma el servidor y no el front por lo mismo de siempre, pero acá con un
 * filo extra: es una **cabecera de correo**, y un salto de línea ahí adentro no
 * ensucia el texto, agrega cabeceras. Por eso cada parte pasa por `texto()`
 * —que se come `\r`, `\n` y `\t`— sin importar de dónde venga ni si ya venía
 * limpia: el que llama no tiene forma de armar un asunto peligroso.
 *
 * Las partes vacías se omiten en vez de dejar el hueco entre guiones: un asunto
 * con « - - » parece un error del sistema. La patente es la excepción, porque
 * su ausencia dice algo —un 0 KM, una carga a medias— y conviene leerla.
 */
export function asuntoDeSolicitud(partes: {
  /** Viene del formulario, así que llega sin validar. */
  readonly agencia: unknown;
  readonly compania: string;
  readonly patente: string;
  readonly cliente: string;
}): string {
  return [
    'Solicitud de Emisión',
    texto(partes.agencia, 80),
    texto(partes.compania, 80),
    texto(partes.patente, 20) || 'sin patente',
    texto(partes.cliente, 120),
  ]
    .filter((parte) => parte !== '')
    .join(' - ');
}

const TITULO_COBERTURA = 'Cobertura elegida';

/** La sección de la cobertura, desde el plan guardado. */
export function seccionDeCobertura(plan: PlanElegido): Solicitud['secciones'][number] {
  return {
    titulo: TITULO_COBERTURA,
    filas: [
      ['Compañía', plan.compania],
      ['Cobertura', `[${plan.code}] ${plan.plan}`],
      ['Costo mensual', plan.costoMensual],
      ...(plan.sumaAsegurada !== undefined ? ([['Suma asegurada', plan.sumaAsegurada]] as const) : []),
    ],
  };
}

/**
 * Las secciones del correo: la de cobertura, del servidor; el resto, del form.
 *
 * Una sección «Cobertura elegida» que venga del cliente se descarta: si no, un
 * correo podía llegar a emisiones con dos coberturas distintas y la falsa
 * primero. Lo demás se acepta con la forma correcta y nada más; el HTML ya lo
 * escapa `armarHtml`.
 */
export function seccionesDeSolicitud(
  delCliente: unknown,
  plan: PlanElegido,
): Solicitud['secciones'] {
  const validas = (Array.isArray(delCliente) ? delCliente : [])
    .map(objeto)
    .filter((s) => typeof s['titulo'] === 'string' && s['titulo'] !== TITULO_COBERTURA)
    .map((s) => ({
      titulo: texto(s['titulo'], 80),
      filas: (Array.isArray(s['filas']) ? s['filas'] : [])
        .filter(
          (f: unknown): f is [string, string] =>
            Array.isArray(f) && typeof f[0] === 'string' && typeof f[1] === 'string',
        )
        .map(([etiqueta, valor]) => [texto(etiqueta, 80), texto(valor, 500)] as const),
    }));
  return [seccionDeCobertura(plan), ...validas];
}

/**
 * Una dirección de correo razonable.
 *
 * No intenta ser RFC 5322: descarta lo que sirve para abusar —varios
 * destinatarios, espacios, saltos de línea— y lo que es obviamente un error.
 */
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/;
const EMAIL_MAXIMO = 254;
const NOMBRE_MAXIMO = 120;

/**
 * A quién se le manda la constancia y cómo se lo saluda.
 *
 * Sin e-mail no se le manda nada al cliente, y la solicitud sale igual. Con uno
 * inválido se rechaza todo: la solicitud sí saldría, pero el vendedor creería
 * que el cliente recibió su constancia.
 */
export function contactoDelCliente(
  email: unknown,
  nombre: unknown,
): { readonly emailCliente?: string; readonly nombreCliente?: string } {
  const direccion = typeof email === 'string' ? email.trim() : '';
  if (direccion !== '' && (direccion.length > EMAIL_MAXIMO || !EMAIL.test(direccion))) {
    throw new ErrorDeCliente('El e-mail del cliente no es válido.');
  }
  if (typeof nombre === 'string' && /[\r\n]/.test(nombre)) {
    throw new ErrorDeCliente('El nombre del cliente no puede tener saltos de línea.');
  }
  const saludo = typeof nombre === 'string' ? nombre.trim() : '';
  if (saludo.length > NOMBRE_MAXIMO) {
    throw new ErrorDeCliente(`El nombre del cliente no puede superar ${NOMBRE_MAXIMO} caracteres.`);
  }
  return {
    ...(direccion !== '' ? { emailCliente: direccion } : {}),
    ...(saludo !== '' ? { nombreCliente: saludo } : {}),
  };
}
