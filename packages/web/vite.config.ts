import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { emitirPase, inyectarPase, secretoDelPase } from '../bff/src/pase.ts';

/**
 * La raíz del repo, donde vive el `.env` que comparten el BFF y el front.
 *
 * Se resuelve desde este archivo y no desde el directorio de trabajo: `npm run
 * dev` se puede lanzar desde la raíz o desde `packages/web`.
 */
const RAIZ = fileURLToPath(new URL('../..', import.meta.url));

/**
 * `HTTPS=1 npm run dev` levanta el front con TLS y certificado autofirmado.
 *
 * Sirve para probar la pantalla de medio de pago como se va a ver en
 * producción: sobre HTTP, Chrome superpone su propia advertencia de
 * autocompletado en los campos de tarjeta.
 */
const conTls = process.env['HTTPS'] === '1';

/**
 * El pase de embebido, en desarrollo.
 *
 * En producción el HTML lo sirve el BFF y le mete el pase sólo si la página se
 * carga desde una agencia. En desarrollo el HTML lo sirve Vite, así que el pase
 * lo agrega este plugin, firmado con el mismo secreto que usa el BFF —o con el
 * de desarrollo, si no hay—: sin esto `npm run dev` recibiría 401 en todo.
 *
 * `apply: 'serve'` es lo que lo deja afuera del build: un pase fijo en
 * `dist/index.html` le serviría a cualquiera que abriera el archivo.
 */
function paseDeDesarrollo(secreto: string): Plugin {
  return {
    name: 'infinito:pase-de-desarrollo',
    apply: 'serve',
    transformIndexHtml(html, { server }) {
      const esquema = server?.config.server.https ? 'https' : 'http';
      const puerto = server?.config.server.port ?? 5180;
      return inyectarPase(html, emitirPase(`${esquema}://localhost:${puerto}`, secreto));
    },
  };
}

export default defineConfig(({ mode }) => {
  const entorno = loadEnv(mode, RAIZ, '');

  /**
   * Quién puede embeber la app, en la misma variable que usa el BFF.
   *
   * En producción esta cabecera la manda el BFF, que es quien sirve el HTML; en
   * desarrollo, Vite. Dejarla acá hace que probar el iframe en desarrollo se
   * comporte como en producción en vez de descubrirlo al salir.
   */
  const sitios = (entorno['SITIOS_EMBEBIBLES'] ?? '')
    .split(',')
    .map((sitio) => sitio.trim())
    .filter((sitio) => sitio !== '');

  const cabeceras = {
    'Content-Security-Policy': ["frame-ancestors 'self'", ...sitios].join(' '),
  };

  return {
    plugins: [
      react(),
      tailwindcss(),
      paseDeDesarrollo(secretoDelPase(entorno)),
      ...(conTls ? [basicSsl()] : []),
    ],
    preview: { headers: cabeceras },
    server: {
      headers: cabeceras,
      // El BFF corre aparte. Con proxy, el front habla a un mismo origen y no
      // hace falta configurar la URL del backend en el cliente.
      proxy: {
        '/api': {
          target: entorno['BFF_URL'] ?? 'http://localhost:5181',
          changeOrigin: true,
        },
      },
    },
  };
});
