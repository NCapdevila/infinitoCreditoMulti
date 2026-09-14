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

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(conTls ? [basicSsl()] : [])],
  server: {
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
