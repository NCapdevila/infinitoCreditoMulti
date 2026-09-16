import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * El front compilado, servido por el BFF.
 *
 * En producción el HTML lo sirve este proceso y no el servidor estático: es la
 * única forma de ver el pedido del documento —de qué sitio viene, si es un
 * iframe— y de meterle el pase adentro. Por comodidad se sirven también los
 * archivos de `packages/web/dist`, así el despliegue es un solo proceso detrás
 * de un proxy que le pasa todo.
 */

/** Dónde está el build del front. `WEB_DIST` permite moverlo en el despliegue. */
export function directorioWeb(): string {
  const propio = process.env['WEB_DIST'] ?? '';
  return propio !== '' ? resolve(propio) : fileURLToPath(new URL('../../web/dist', import.meta.url));
}

const TIPOS: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

export const tipoDe = (ruta: string) => TIPOS[extname(ruta).toLowerCase()] ?? 'application/octet-stream';

/**
 * Cuánto se puede cachear cada archivo.
 *
 * Lo de `assets/` lleva el hash del contenido en el nombre: si cambia, cambia
 * la URL, así que se cachea un año sin miedo. El resto —el favicon, las fotos
 * de ejemplo, los logos— conserva el nombre entre versiones y se revalida cada
 * hora.
 */
export const cacheDe = (rutaRelativa: string) =>
  rutaRelativa.startsWith('/assets/')
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600';

export interface Estatico {
  readonly contenido: Buffer;
  readonly tipo: string;
  readonly cache: string;
}

/**
 * Lee un archivo del build, o `undefined` si no hay tal cosa.
 *
 * La ruta viene de la URL, así que se resuelve y se verifica que siga adentro
 * del directorio: sin eso, `/../../.env` sirve el archivo de secretos.
 */
export async function leerEstatico(dir: string, pathname: string): Promise<Estatico | undefined> {
  let decodificada: string;
  try {
    decodificada = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decodificada.includes('\0')) return undefined;

  const raiz = resolve(dir);
  const ruta = resolve(raiz, `.${decodificada}`);
  if (!ruta.startsWith(raiz + sep)) return undefined;

  try {
    if (!(await stat(ruta)).isFile()) return undefined;
    return { contenido: await readFile(ruta), tipo: tipoDe(ruta), cache: cacheDe(decodificada) };
  } catch {
    return undefined;
  }
}

/** El HTML del cotizador, tal como salió del build. */
export async function leerDocumento(dir: string): Promise<string | undefined> {
  try {
    return await readFile(resolve(dir, 'index.html'), 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * Lo que ve quien abre el cotizador fuera del sitio de una agencia.
 *
 * Sin detalles de por qué: el motivo va al log, que es donde sirve.
 */
export function paginaDeRechazo(): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cotizador no disponible</title>
  </head>
  <body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:16px/1.5 system-ui,sans-serif;color:#494949;background:#fff">
    <main style="max-width:360px;padding:24px;text-align:center">
      <h1 style="margin:0 0 8px;font-size:20px;color:#3379f6">Cotizador no disponible</h1>
      <p style="margin:0">Este cotizador sólo está disponible desde el sitio de tu agencia.</p>
    </main>
  </body>
</html>
`;
}
