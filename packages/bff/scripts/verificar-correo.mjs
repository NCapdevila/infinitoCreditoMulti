/**
 * Comprueba que las credenciales de correo funcionan.
 *
 *   node --env-file-if-exists=.env packages/bff/scripts/verificar-correo.mjs
 *
 * Sólo abre la conexión y se autentica: no manda ningún mensaje.
 */
import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST ?? '';
const port = Number.parseInt(process.env.SMTP_PORT ?? '587', 10);
const user = process.env.SMTP_USER ?? '';
const pass = process.env.SMTP_PASS ?? '';

console.log(`servidor : ${host}:${port}`);
console.log(`usuario  : ${user}`);
console.log(`destino  : ${process.env.MAIL_TO ?? '(sin definir)'}`);
console.log(`remitente: ${process.env.MAIL_FROM ?? '(usa el usuario)'}`);
console.log();

const transporte = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: user !== '' ? { user, pass } : undefined,
  connectionTimeout: 15_000,
  greetingTimeout: 15_000,
});

try {
  await transporte.verify();
  console.log('✓ conexión y autenticación correctas');
} catch (error) {
  console.log('✗ no se pudo verificar');
  console.log('  ', error instanceof Error ? error.message : String(error));
  const codigo = error?.responseCode ?? error?.code;
  if (codigo !== undefined) console.log('   código:', codigo);
  process.exitCode = 1;
}
