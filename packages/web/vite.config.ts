import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * `HTTPS=1 npm run dev` levanta el front con TLS y certificado autofirmado.
 *
 * Sirve para probar la pantalla de medio de pago como se va a ver en
 * producción: sobre HTTP, Chrome superpone su propia advertencia de
 * autocompletado en los campos de tarjeta.
 */
const conTls = process.env['HTTPS'] === '1';

/**
 * Quién puede embeber la app, en la misma variable que usa el BFF.
 *
 * Esta cabecera es la que decide el embebido, y la manda quien sirve el HTML:
 * en desarrollo, Vite; en producción, el servidor estático o el CDN, que la
 * tiene que mandar igual (ver README). Dejarla acá hace que probar el iframe en
 * desarrollo se comporte como en producción en vez de descubrirlo al salir.
 */
const sitios = (process.env['SITIOS_EMBEBIBLES'] ?? '')
  .split(',')
  .map((sitio) => sitio.trim())
  .filter((sitio) => sitio !== '');

const cabeceras = {
  'Content-Security-Policy': ["frame-ancestors 'self'", ...sitios].join(' '),
};

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(conTls ? [basicSsl()] : [])],
  preview: { headers: cabeceras },
  server: {
    headers: cabeceras,
    // El BFF corre aparte. Con proxy, el front habla a un mismo origen y no
    // hace falta CORS ni configurar la URL del backend en el cliente.
    proxy: {
      '/api': {
        target: process.env['BFF_URL'] ?? 'http://localhost:5181',
        changeOrigin: true,
      },
    },
  },
});
