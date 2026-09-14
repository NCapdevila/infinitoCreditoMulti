/**
 * Servidor SMTP de juguete, para probar el envío sin mandar correo de verdad.
 *
 *   node scripts/smtp-de-prueba.mjs
 *   SMTP_HOST=localhost SMTP_PORT=2525 MAIL_TO=alguien@ejemplo.com npm run dev
 *
 * Acepta la conversación SMTP mínima y reporta qué recibió: asunto, adjuntos y
 * tamaño. No guarda nada ni reenvía a ningún lado.
 */
import { createServer } from 'node:net';

const PUERTO = Number.parseInt(process.env.PORT ?? '2525', 10);

createServer((socket) => {
  let recibiendoDatos = false;
  let mensaje = '';

  socket.write('220 smtp-de-prueba listo\r\n');

  socket.on('data', (trozo) => {
    const texto = trozo.toString('utf-8');

    if (recibiendoDatos) {
      mensaje += texto;
      // El punto solo en una línea cierra el cuerpo.
      if (mensaje.includes('\r\n.\r\n')) {
        recibiendoDatos = false;
        const asunto = /^Subject: (.*)$/m.exec(mensaje)?.[1] ?? '(sin asunto)';
        const adjuntos = [...mensaje.matchAll(/filename="?([^"\r\n;]+)"?/g)].map((m) => m[1]);
        console.log('\n── correo recibido ──');
        console.log('  asunto   :', asunto);
        console.log('  tamaño   :', (mensaje.length / 1024 / 1024).toFixed(2), 'MB');
        console.log('  adjuntos :', adjuntos.length);
        for (const a of adjuntos) console.log('    ·', a);
        // ¿Viajan los datos que importan?
        for (const dato of ['Solicitud de emisión', 'AI531QZ', 'Zurich']) {
          console.log(`  contiene "${dato}":`, mensaje.includes(dato) ? 'sí' : 'NO');
        }
        socket.write('250 OK: mensaje aceptado\r\n');
        mensaje = '';
      }
      return;
    }

    for (const linea of texto.split('\r\n').filter((l) => l !== '')) {
      const comando = linea.slice(0, 4).toUpperCase();
      if (comando === 'EHLO' || comando === 'HELO') {
        socket.write('250-smtp-de-prueba\r\n250 AUTH PLAIN LOGIN\r\n');
      } else if (comando === 'AUTH') {
        socket.write('235 autenticado\r\n');
      } else if (comando === 'MAIL' || comando === 'RCPT') {
        socket.write('250 OK\r\n');
      } else if (comando === 'DATA') {
        recibiendoDatos = true;
        socket.write('354 mandá el mensaje, terminá con .\r\n');
      } else if (comando === 'QUIT') {
        socket.write('221 chau\r\n');
        socket.end();
      } else {
        socket.write('250 OK\r\n');
      }
    }
  });

  socket.on('error', () => undefined);
}).listen(PUERTO, () => {
  console.log(`SMTP de prueba escuchando en localhost:${PUERTO}`);
  console.log('Configurá el BFF con:');
  console.log(`  SMTP_HOST=localhost SMTP_PORT=${PUERTO} MAIL_TO=prueba@ejemplo.com`);
});
