/**
 * Compresión de las fotos del vehículo.
 *
 * Las nueve tomas salen de la cámara de un teléfono: entre 2 y 4 MB cada una,
 * 36 MB en total. Ningún servidor de correo acepta eso —Gmail corta en 25 MB y
 * los corporativos suelen cortar en 10—, así que se reducen antes de enviarlas.
 *
 * A 1600 px de lado mayor y calidad 0,7 cada foto queda en ~300 KB: las nueve
 * entran en un correo de unos 3 MB y siguen siendo legibles para una
 * inspección, que es para lo que están.
 */

/** Lado mayor al que se reduce cada foto. */
const LADO_MAXIMO = 1600;
const CALIDAD = 0.7;

/** Un adjunto listo para viajar en el correo. */
export interface Adjunto {
  readonly nombre: string;
  readonly tipo: string;
  /** Contenido en base64, sin el prefijo `data:`. */
  readonly contenido: string;
}

const leerComoDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error(`No pudimos leer ${file.name}`));
    lector.readAsDataURL(file);
  });

const cargarImagen = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No pudimos abrir la imagen'));
    img.src = url;
  });

/** Separa el base64 del prefijo `data:tipo;base64,`. */
export function partirDataUrl(dataUrl: string): { tipo: string; contenido: string } {
  const [cabecera = '', contenido = ''] = dataUrl.split(',');
  const tipo = /:(.*?);/.exec(cabecera)?.[1] ?? 'application/octet-stream';
  return { tipo, contenido };
}

/**
 * Reduce una foto y la devuelve como data URL.
 *
 * Los PDF —la cédula verde suele venir así— no pasan por canvas: se devuelven
 * tal cual, porque comprimirlos acá los rompería.
 */
export async function comprimirImagen(file: File): Promise<string> {
  const original = await leerComoDataUrl(file);
  if (!file.type.startsWith('image/')) return original;

  try {
    const img = await cargarImagen(original);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));

    // Ya es chica: recomprimirla solo agregaría pérdida.
    if (escala === 1 && file.size < 400 * 1024) return original;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);

    const ctx = canvas.getContext('2d');
    if (ctx === null) return original;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const comprimida = canvas.toDataURL('image/jpeg', CALIDAD);
    // Si comprimir no mejoró nada, se queda el original.
    return comprimida.length < original.length ? comprimida : original;
  } catch {
    // Ante cualquier problema, mejor mandar la foto grande que no mandarla.
    return original;
  }
}

/** Arma el adjunto a partir de un data URL ya comprimido. */
export function comoAdjunto(nombre: string, dataUrl: string): Adjunto {
  const { tipo, contenido } = partirDataUrl(dataUrl);
  return { nombre, tipo, contenido };
}
