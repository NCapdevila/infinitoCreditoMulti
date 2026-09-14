import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Envío de la solicitud de emisión por correo.
 *
 * No se guarda nada: el correo **es** el registro de la operación. Eso obliga a
 * que el envío sea confiable, así que se reintenta y, si aun así falla, el
 * front avisa y deja descargar la constancia para no perder la carga.
 *
 * ADVERTENCIA — datos de tarjeta: por decisión del negocio el correo lleva el
 * número de tarjeta completo. Esto va en contra de PCI-DSS: el mensaje queda en
 * buzones, servidores intermedios y backups fuera de control, sin posibilidad
 * de borrado. La alternativa es enviar sólo los últimos cuatro dígitos, que
 * alcanza para que un emisor identifique el medio de pago.
 */

export interface Adjunto {
  readonly nombre: string;
  readonly tipo: string;
  /** Base64 sin el prefijo `data:`. */
  readonly contenido: string;
}

export interface Solicitud {
  readonly secciones: readonly {
    readonly titulo: string;
    readonly filas: readonly (readonly [string, string])[];
  }[];
  readonly asunto: string;
  readonly adjuntos: readonly Adjunto[];
  /** Correo del comprador, para mandarle su constancia. Opcional. */
  readonly emailCliente?: string;
  /** Con qué nombre saludarlo. */
  readonly nombreCliente?: string;
}

/** Cuántas veces se reintenta antes de darlo por fallido. */
const INTENTOS = 3;

/** Dominio de CE Brokers para las respuestas del cliente. */
const CONTACTO = 'contacto@cebrokers.com.ar';

const config = () => ({
  host: process.env['SMTP_HOST'] ?? '',
  port: Number.parseInt(process.env['SMTP_PORT'] ?? '587', 10),
  user: process.env['SMTP_USER'] ?? '',
  pass: process.env['SMTP_PASS'] ?? '',
  desde: process.env['MAIL_FROM'] ?? process.env['SMTP_USER'] ?? '',
  para: process.env['MAIL_TO'] ?? '',
});

/** El correo no está configurado: el endpoint lo informa en vez de fallar raro. */
export function correoConfigurado(): boolean {
  const c = config();
  return c.host !== '' && c.para !== '';
}

let transporte: Transporter | null = null;
function obtenerTransporte(): Transporter {
  if (transporte !== null) return transporte;
  const c = config();
  transporte = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.port === 465,
    ...(c.user !== '' ? { auth: { user: c.user, pass: c.pass } } : {}),
  });
  return transporte;
}

const escapar = (texto: string) =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Arma el cuerpo del correo: una tabla por sección, legible en cualquier cliente.
 *
 * La columna de etiquetas lleva un ancho fijo en todas las secciones. Sin eso,
 * cada tabla lo calcula según su etiqueta más larga y los valores arrancan en
 * una posición distinta en cada bloque, que es lo que hacía ver el correo
 * desprolijo.
 */
const ANCHO_ETIQUETA = 170;

export function armarHtml(solicitud: Solicitud): string {
  const secciones = solicitud.secciones
    .map(({ titulo, filas }) => {
      const cuerpo = filas
        .map(
          ([label, valor]) =>
            `<tr>` +
            `<td style="padding:5px 16px 5px 0;color:#6e6c83;vertical-align:top;width:${ANCHO_ETIQUETA}px">${escapar(label)}</td>` +
            `<td style="padding:5px 0;color:#1f1f27;vertical-align:top"><strong>${escapar(valor)}</strong></td>` +
            `</tr>`,
        )
        .join('');
      return (
        `<h2 style="margin:26px 0 6px;font:700 14px/1.3 Arial,sans-serif;color:#1f1f27">${escapar(titulo)}</h2>` +
        `<table role="presentation" cellpadding="0" cellspacing="0" ` +
        `style="border-collapse:collapse;table-layout:fixed;font:14px/1.5 Arial,sans-serif;width:100%">` +
        `<tr><td style="width:${ANCHO_ETIQUETA}px;padding:0;font-size:0;line-height:0">&nbsp;</td><td style="padding:0;font-size:0;line-height:0">&nbsp;</td></tr>` +
        `${cuerpo}</table>`
      );
    })
    .join('');

  return (
    `<div style="max-width:640px;margin:0 auto;padding:24px;font-family:Arial,sans-serif">` +
    `<h1 style="margin:0;font:700 20px/1.3 Arial,sans-serif;color:#1f1f27">Solicitud de emisión</h1>` +
    `<p style="margin:6px 0 0;color:#6e6c83;font-size:13px">` +
    `Generada desde el cotizador. La constancia va adjunta en PDF.</p>` +
    secciones +
    `<p style="margin:32px 0 0;color:#a2a2a7;font-size:12px">` +
    `CE Brokers · este mensaje contiene datos personales y de pago: no reenviar.</p>` +
    `</div>`
  );
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cuerpo del correo que recibe el comprador.
 *
 * Deliberadamente no lleva nada de lo que va en el correo interno: ni datos de
 * pago, ni las fotos de la inspección, ni los datos de la agencia. Sólo su
 * constancia y qué esperar a continuación.
 */
function armarHtmlCliente(nombre: string | undefined): string {
  const saludo = nombre !== undefined && nombre.trim() !== '' ? `Hola ${escapar(nombre)},` : 'Hola,';
  return (
    `<div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;color:#1f1f27">` +
    `<h1 style="margin:0 0 16px;font:700 20px/1.3 Arial,sans-serif;color:#3379f6">` +
    `Tu póliza está en proceso de emisión</h1>` +
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${saludo}</p>` +
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">` +
    `Adjuntamos la <strong>constancia de cobertura</strong> de tu seguro. Es un instrumento ` +
    `provisorio: dentro de los quince días corridos la aseguradora emite la póliza definitiva ` +
    `y te la hacemos llegar.</p>` +
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">` +
    `Guardá este correo: la constancia acredita que el vehículo está cubierto.</p>` +
    `<p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#6e6c83">` +
    `Cualquier duda, respondé este correo o escribinos a ` +
    `<a href="mailto:${CONTACTO}" style="color:#3379f6">${CONTACTO}</a>.</p>` +
    `<p style="margin:28px 0 0;font-size:12px;color:#a2a2a7">` +
    `CE Brokers · Matrícula SSN 1205</p>` +
    `</div>`
  );
}

export interface ResultadoEnvio {
  readonly enviado: boolean;
  readonly intentos: number;
  /**
   * Id que asigna el servidor de correo.
   *
   * Sin base de datos, es lo único con lo que después se puede rastrear una
   * operación: se busca por ese id en el panel del proveedor.
   */
  readonly messageId?: string;
  readonly error?: string;
}

/**
 * Manda la solicitud, reintentando ante fallas transitorias.
 *
 * Un servidor de correo caído o una conexión cortada suelen resolverse en el
 * segundo intento; si después de tres no salió, el problema es de
 * configuración y hay que avisarle a alguien.
 */
export async function enviarSolicitud(
  solicitud: Solicitud,
  constancia: Buffer,
): Promise<ResultadoEnvio> {
  const c = config();
  if (!correoConfigurado()) {
    return { enviado: false, intentos: 0, error: 'el correo no está configurado en el servidor' };
  }

  const mensaje = {
    from: c.desde,
    to: c.para,
    subject: solicitud.asunto,
    html: armarHtml(solicitud),
    attachments: [
      { filename: 'constancia.pdf', content: constancia, contentType: 'application/pdf' },
      ...solicitud.adjuntos.map((a) => ({
        filename: a.nombre,
        content: Buffer.from(a.contenido, 'base64'),
        contentType: a.tipo,
      })),
    ],
  };

  let ultimoError = '';
  for (let intento = 1; intento <= INTENTOS; intento += 1) {
    try {
      const info = await obtenerTransporte().sendMail(mensaje);
      console.log(`[correo] enviado a ${c.para} · id ${info.messageId}`);
      return { enviado: true, intentos: intento, messageId: info.messageId };
    } catch (error) {
      ultimoError = error instanceof Error ? error.message : String(error);
      console.error(`[correo] intento ${intento}/${INTENTOS} falló:`, ultimoError);
      // El transporte puede haber quedado inservible; se rearma en el próximo.
      transporte = null;
      if (intento < INTENTOS) await esperar(intento * 1000);
    }
  }

  return { enviado: false, intentos: INTENTOS, error: ultimoError };
}

/**
 * Le manda al comprador su constancia de cobertura.
 *
 * Es secundario respecto del correo interno: si esto falla, la solicitud ya
 * llegó igual a emisiones y la operación no se pierde. Por eso se reporta pero
 * no se trata como error fatal.
 */
export async function enviarConstanciaAlCliente(
  email: string,
  nombre: string | undefined,
  constancia: Buffer,
): Promise<ResultadoEnvio> {
  const c = config();
  if (!correoConfigurado()) {
    return { enviado: false, intentos: 0, error: 'el correo no está configurado en el servidor' };
  }

  const mensaje = {
    from: c.desde,
    to: email,
    replyTo: CONTACTO,
    subject: 'Tu constancia de cobertura · CE Brokers',
    html: armarHtmlCliente(nombre),
    attachments: [
      { filename: 'constancia-de-cobertura.pdf', content: constancia, contentType: 'application/pdf' },
    ],
  };

  let ultimoError = '';
  for (let intento = 1; intento <= INTENTOS; intento += 1) {
    try {
      const info = await obtenerTransporte().sendMail(mensaje);
      console.log(`[correo] constancia enviada a ${email} · id ${info.messageId}`);
      return { enviado: true, intentos: intento, messageId: info.messageId };
    } catch (error) {
      ultimoError = error instanceof Error ? error.message : String(error);
      console.error(`[correo] constancia al cliente, intento ${intento}/${INTENTOS}:`, ultimoError);
      transporte = null;
      if (intento < INTENTOS) await esperar(intento * 1000);
    }
  }

  return { enviado: false, intentos: INTENTOS, error: ultimoError };
}
