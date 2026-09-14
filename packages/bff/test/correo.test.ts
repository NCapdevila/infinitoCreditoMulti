import { describe, expect, it } from 'vitest';
import { correoConfigurado, enviarSolicitud } from '../src/correo.js';

/**
 * El correo es el único registro de la operación: si no está configurado, eso
 * tiene que decirse claro y no fallar de manera confusa a mitad del flujo.
 */
describe('configuración del correo', () => {
  it('se considera sin configurar si falta el servidor o el destino', () => {
    const previo = { ...process.env };
    delete process.env['SMTP_HOST'];
    delete process.env['MAIL_TO'];
    expect(correoConfigurado()).toBe(false);

    process.env['SMTP_HOST'] = 'smtp.mailgun.org';
    expect(correoConfigurado(), 'sin destinatario no alcanza').toBe(false);

    process.env['MAIL_TO'] = 'emisiones@cebrokers.com.ar';
    expect(correoConfigurado()).toBe(true);

    process.env = previo;
  });

  it('no intenta enviar si no está configurado', async () => {
    const previo = { ...process.env };
    delete process.env['SMTP_HOST'];
    delete process.env['MAIL_TO'];

    const r = await enviarSolicitud(
      { asunto: 'x', secciones: [], adjuntos: [] },
      Buffer.from('%PDF'),
    );
    expect(r.enviado).toBe(false);
    expect(r.intentos, 'no debería gastar reintentos en un problema de config').toBe(0);
    expect(r.error).toContain('no está configurado');

    process.env = previo;
  });
});
