import type { Adjunto } from './correo.js';
import { ErrorDeCliente, ErrorHttp } from './errores.js';

/**
 * Los adjuntos de la solicitud: fotos del vehículo y la cédula.
 *
 * Van directo al buzón de emisiones, así que no se le cree nada al cliente
 * sobre ellos. El tipo declarado y el nombre del archivo eran suyos: bastaba
 * con mandar un `.exe` o un `.html` diciendo `image/jpeg` para que llegara a
 * emisiones con cara de foto.
 *
 * Ahora el tipo se deduce de los primeros bytes del contenido y el nombre lo
 * pone el servidor, a partir de qué toma es. Del cliente sólo se usa esa clave
 * —de una lista cerrada— y los bytes.
 */

type Entorno = Readonly<Record<string, string | undefined>>;

/**
 * Cada toma y el nombre con el que llega a emisiones.
 *
 * Son los `tipo` de `TOMAS` en el front. Una clave que no está acá se rechaza:
 * no hay forma de que el cliente elija el nombre del archivo.
 */
const NOMBRES: Readonly<Record<string, string>> = {
  FRENTE: 'foto-frente',
  TRASERA: 'foto-trasera',
  LATERAL_CONDUCTOR: 'foto-lateral-conductor',
  LATERAL_PASAJERO: 'foto-lateral-pasajero',
  PARABRISAS: 'foto-parabrisas',
  RUEDA_AUXILIO: 'foto-rueda-de-auxilio',
  TABLERO_CONTACTO: 'foto-tablero',
  TECHO: 'foto-techo',
  CEDULA_VERDE: 'cedula',
};

interface Tipo {
  readonly mime: string;
  readonly extension: string;
}

const empiezaCon = (bytes: Buffer, firma: readonly number[], desde = 0) =>
  bytes.length >= desde + firma.length && firma.every((b, i) => bytes[desde + i] === b);

const ascii = (texto: string) => [...texto].map((c) => c.charCodeAt(0));

/**
 * El tipo real del contenido, por su firma, o `undefined` si no es uno aceptado.
 *
 * Son las firmas publicadas de cada formato. Un ejecutable empieza con `MZ`, un
 * HTML con `<`: ninguno coincide con estas, se llamen como se llamen.
 */
export function tipoPorContenido(bytes: Buffer): Tipo | undefined {
  if (empiezaCon(bytes, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', extension: 'jpg' };
  if (empiezaCon(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: 'image/png', extension: 'png' };
  }
  // WEBP es un contenedor RIFF: `RIFF` + 4 bytes de largo + `WEBP`.
  if (empiezaCon(bytes, ascii('RIFF')) && empiezaCon(bytes, ascii('WEBP'), 8)) {
    return { mime: 'image/webp', extension: 'webp' };
  }
  if (empiezaCon(bytes, ascii('%PDF-'))) return { mime: 'application/pdf', extension: 'pdf' };
  return undefined;
}

const entero = (valor: string | undefined, porDefecto: number) => {
  const n = Number.parseInt(valor ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
};

export interface LimitesAdjuntos {
  readonly cantidad: number;
  readonly bytesPorAdjunto: number;
}

/**
 * Cuántos adjuntos y de qué tamaño.
 *
 * Doce alcanza para las nueve tomas con margen. Cinco megas por archivo queda
 * por encima de los 4 MB que acepta la pantalla de carga: una foto normal nunca
 * choca con esto, uno armado a mano sí. El total lo sigue topando el límite del
 * cuerpo de `/api/solicitud`.
 */
export function limitesAdjuntos(entorno: Entorno = process.env): LimitesAdjuntos {
  return {
    cantidad: entero(entorno['LIMITE_ADJUNTOS'], 12),
    bytesPorAdjunto: entero(entorno['LIMITE_ADJUNTO_MB'], 5) * 1024 * 1024,
  };
}

/**
 * Valida los adjuntos que manda el cliente y los deja listos para el correo.
 *
 * Cada uno es `{ clave, contenido }`, con el contenido en base64. Cualquier
 * cosa fuera de lugar rechaza la solicitud entera: mandar a emisiones una
 * solicitud con una foto de menos, sin avisar, es peor que no mandarla.
 */
export function validarAdjuntos(crudos: unknown, limites: LimitesAdjuntos = limitesAdjuntos()): Adjunto[] {
  if (crudos === undefined) return [];
  if (!Array.isArray(crudos)) throw new ErrorDeCliente('`adjuntos` tiene que ser una lista');
  if (crudos.length > limites.cantidad) {
    throw new ErrorDeCliente(`demasiados adjuntos: el máximo es ${limites.cantidad}`);
  }

  const vistas = new Set<string>();
  return crudos.map((crudo: unknown) => {
    const { clave, contenido } = (typeof crudo === 'object' && crudo !== null ? crudo : {}) as Record<
      string,
      unknown
    >;
    if (typeof clave !== 'string' || NOMBRES[clave] === undefined) {
      throw new ErrorDeCliente(`adjunto desconocido: ${String(clave)}`);
    }
    if (vistas.has(clave)) throw new ErrorDeCliente(`adjunto repetido: ${clave}`);
    vistas.add(clave);
    if (typeof contenido !== 'string' || contenido === '') {
      throw new ErrorDeCliente(`el adjunto ${clave} está vacío`);
    }

    const bytes = Buffer.from(contenido, 'base64');
    if (bytes.length > limites.bytesPorAdjunto) {
      const mb = Math.round(limites.bytesPorAdjunto / (1024 * 1024));
      throw new ErrorHttp(413, `el adjunto ${clave} supera los ${mb} MB`);
    }
    const tipo = tipoPorContenido(bytes);
    if (tipo === undefined) {
      throw new ErrorDeCliente(`el adjunto ${clave} no es una imagen JPEG, PNG o WEBP ni un PDF`);
    }

    return {
      nombre: `${NOMBRES[clave]}.${tipo.extension}`,
      tipo: tipo.mime,
      // Se vuelve a codificar desde los bytes: lo que viaja es exactamente lo
      // que se verificó, sin caracteres de más que el decodificador ignoró.
      contenido: bytes.toString('base64'),
    };
  });
}
