import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * El comprador recibe su constancia y nada más.
 *
 * Es el punto donde un descuido se paga caro: el correo interno lleva número de
 * tarjeta, fotos del vehículo y datos de la agencia, y ninguna de esas cosas
 * puede terminar en la casilla del cliente.
 */
const enviados: { to: string; html: string; attachments: { filename: string }[] }[] = [];

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: (mensaje: { to: string; html: string; attachments: { filename: string }[] }) => {
        enviados.push(mensaje);
        return Promise.resolve({ messageId: '<prueba@local>' });
      },
    }),
  },
}));

const { enviarConstanciaAlCliente, enviarSolicitud } = await import('../src/correo.js');

const TARJETA = '4545-0000-0300-5454';
const AGENCIA = 'Automotores del Litoral';

beforeEach(() => {
  enviados.length = 0;
  process.env['SMTP_HOST'] = 'localhost';
  process.env['MAIL_TO'] = 'emisiones@ejemplo.com';
});

describe('correo al comprador', () => {
  it('lleva la constancia y sólo la constancia', async () => {
    const r = await enviarConstanciaAlCliente(
      'comprador@ejemplo.com',
      'Wenceslao',
      Buffer.from('%PDF-fake'),
    );

    expect(r.enviado).toBe(true);
    const mensaje = enviados.at(-1);
    expect(mensaje?.to).toBe('comprador@ejemplo.com');
    expect(mensaje?.attachments).toHaveLength(1);
    expect(mensaje?.attachments[0]?.filename).toBe('constancia-de-cobertura.pdf');
  });

  it('no incluye datos de pago ni de la agencia', async () => {
    await enviarConstanciaAlCliente('comprador@ejemplo.com', 'Wenceslao', Buffer.from('%PDF'));
    const html = enviados.at(-1)?.html ?? '';

    expect(html).not.toContain(TARJETA);
    expect(html).not.toContain(AGENCIA);
    expect(html).not.toMatch(/CBU/i);
    // Lo que sí tiene que decir.
    expect(html).toContain('Wenceslao');
    expect(html).toMatch(/constancia/i);
  });

  it('saluda sin nombre si no lo hay', async () => {
    await enviarConstanciaAlCliente('comprador@ejemplo.com', undefined, Buffer.from('%PDF'));
    expect(enviados.at(-1)?.html).toContain('Hola,');
  });
});

describe('correo interno', () => {
  it('sí lleva los datos de pago y las fotos: es el que habilita emitir', async () => {
    await enviarSolicitud(
      {
        asunto: 'Solicitud',
        secciones: [
          { titulo: 'Medio de pago', filas: [['Número', TARJETA]] },
          { titulo: 'Agencia', filas: [['Agencia', AGENCIA]] },
        ],
        adjuntos: [{ nombre: 'frente.jpg', tipo: 'image/jpeg', contenido: 'AAAA' }],
      },
      Buffer.from('%PDF'),
    );

    const mensaje = enviados.at(-1);
    expect(mensaje?.to).toBe('emisiones@ejemplo.com');
    expect(mensaje?.html).toContain(TARJETA);
    expect(mensaje?.attachments.map((a) => a.filename)).toEqual([
      'constancia.pdf',
      'frente.jpg',
    ]);
  });
});
