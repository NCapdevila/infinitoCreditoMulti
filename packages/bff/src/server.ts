import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { generarCertificado, type DatosCertificado } from './certificado.js';
import {
  correoConfigurado,
  enviarConstanciaAlCliente,
  enviarSolicitud,
  type Solicitud,
} from './correo.js';
import { MotorClient, MotorHttpError } from './motor/client.js';
import { MotorParseError, type MotorSession, type Step } from './motor/types.js';
import type { Quotations } from './motor/quotations.js';
import {
  ErrorDemasiadoGrande,
  LIMITE_JSON,
  cabecerasDeSeguridad,
  consumirCupo,
  esPreflight,
  evaluarOrigen,
  hayAllowlist,
  ipDe,
  leerCuerpoLimitado,
  limiteSolicitud,
  limpiarCupos,
  origenesPermitidos,
  sitiosEmbebibles,
} from './seguridad.js';

/**
 * API del cotizador.
 *
 * Traduce el motor htmx a JSON. El front nunca ve HTML, ni el token de sesión,
 * ni el CSRF: eso queda de este lado, que además es lo correcto — el CSRF rota
 * en cada respuesta y mandarlo al browser sólo daría oportunidad de perderlo.
 *
 * Las cotizaciones viven en memoria. Alcanza para desarrollo y para un único
 * proceso; persistirlas es lo que pide el borrador del wizard (spec 7.10) y es
 * el próximo paso natural.
 */

const PUERTO = Number.parseInt(process.env['PORT'] ?? '5181', 10);

const motor = new MotorClient({
  baseUrl: process.env['MOTOR_URL'] ?? 'https://infinito.foxia.ar',
  uuid: process.env['MOTOR_UUID'] ?? '994b4085-999d-4301-9531-607ff61fca42',
});

interface Cotizacion {
  session: MotorSession;
  paso: Step;
  /** Lo que el usuario fue eligiendo, para poder rearmar la contratación. */
  valores: Record<string, string>;
  /** El motor ya está cotizando: se piden resultados, no pasos. */
  cotizando: boolean;
  /**
   * Los pasos por los que ya pasó esta cotización, en orden.
   *
   * Es lo que hace posible el botón de volver. El motor lo resuelve con
   * `history.back()` del navegador, que no le sirve a un front que es una sola
   * página; acá el camino recorrido es del servidor, que es el único que puede
   * autorizar un paso atrás sin que el front invente ids.
   */
  visitados: string[];
  creada: number;
}

const cotizaciones = new Map<string, Cotizacion>();

/** Una cotización sin tocar durante media hora ya no le sirve a nadie. */
const TTL_MS = 30 * 60 * 1000;
setInterval(() => {
  const limite = Date.now() - TTL_MS;
  for (const [id, c] of cotizaciones) {
    if (c.creada < limite) cotizaciones.delete(id);
  }
}, 5 * 60 * 1000).unref();

// ── helpers HTTP ───────────────────────────────────────────────────────

function responder(res: ServerResponse, status: number, cuerpo: unknown): void {
  const json = JSON.stringify(cuerpo);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

async function leerJson(
  req: IncomingMessage,
  maximo: number = LIMITE_JSON,
): Promise<Record<string, unknown>> {
  const crudo = await leerCuerpoLimitado(req, maximo);
  if (crudo === '') return {};
  try {
    return JSON.parse(crudo) as Record<string, unknown>;
  } catch {
    throw new ErrorDeCliente('el cuerpo no es JSON válido');
  }
}

/**
 * Lee el cuerpo venga como JSON o como formulario.
 *
 * La descarga del certificado se dispara con un POST de formulario nativo —es
 * lo único que hace que el navegador respete `Content-Disposition` sin pasar
 * por un blob—, así que este endpoint acepta las dos formas.
 */
async function leerJsonOFormulario(req: IncomingMessage): Promise<Record<string, unknown>> {
  const tipo = req.headers['content-type'] ?? '';
  const crudo = await leerCuerpoLimitado(req, LIMITE_JSON);
  if (crudo === '') return {};

  if (tipo.includes('application/x-www-form-urlencoded')) {
    const datos = new URLSearchParams(crudo).get('datos');
    if (datos === null) throw new ErrorDeCliente('falta el campo `datos`');
    try {
      return JSON.parse(datos) as Record<string, unknown>;
    } catch {
      throw new ErrorDeCliente('`datos` no es JSON válido');
    }
  }

  try {
    return JSON.parse(crudo) as Record<string, unknown>;
  } catch {
    throw new ErrorDeCliente('el cuerpo no es JSON válido');
  }
}

class ErrorDeCliente extends Error {}

function buscarCotizacion(id: string | undefined): Cotizacion {
  const cotizacion = id === undefined ? undefined : cotizaciones.get(id);
  if (cotizacion === undefined) {
    throw new ErrorDeCliente('la cotización no existe o expiró');
  }
  return cotizacion;
}

/** Sólo lo que el front necesita: nada de sesión ni de CSRF. */
const paraElFront = (id: string, c: Cotizacion) => ({
  id,
  paso: c.paso,
  cotizando: c.cotizando,
  /** A dónde lleva el botón de volver, o `null` si es el primer paso. */
  anterior: c.visitados[c.visitados.length - 2] ?? null,
});

// ── rutas ──────────────────────────────────────────────────────────────

async function crear(res: ServerResponse): Promise<void> {
  const { session, step } = await motor.start();
  const id = randomUUID();
  cotizaciones.set(id, {
    session,
    paso: step,
    valores: {},
    cotizando: false,
    visitados: [step.id],
    creada: Date.now(),
  });
  responder(res, 201, paraElFront(id, cotizaciones.get(id)!));
}

/**
 * Completa el paso actual y devuelve el siguiente.
 *
 * Si el motor contesta con la pantalla de espera, ya tiene todo: se dispara la
 * cotización y a partir de ahí el front pide resultados.
 */
async function avanzar(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
  const cotizacion = buscarCotizacion(id);
  const cuerpo = await leerJson(req);
  const valores = cuerpo['valores'];
  if (typeof valores !== 'object' || valores === null) {
    throw new ErrorDeCliente('falta `valores`');
  }

  const paso = cotizacion.paso;
  if (paso.kind === 'waiting') {
    throw new ErrorDeCliente('la cotización ya está en curso');
  }
  if (paso.kind === 'info') {
    // Una pantalla informativa no se completa: se sale por una de sus acciones.
    throw new ErrorDeCliente('el paso actual no pide datos; usá una de sus acciones');
  }

  const { session, step } = await motor.submit(
    paso.submit.step,
    cotizacion.session,
    valores as Record<string, string>,
    paso.submit.next ?? '',
  );

  cotizacion.session = session;
  cotizacion.paso = step;
  cotizacion.visitados.push(step.id);
  Object.assign(cotizacion.valores, valores);

  if (step.kind === 'waiting') {
    await motor.save(session);
    cotizacion.cotizando = true;
  }

  responder(res, 200, paraElFront(id, cotizacion));
}

/**
 * Toma una salida alternativa del paso actual («Cotizar sin patente», «Otra
 * marca»): trae otro paso sin completar el vigente.
 */
async function ir(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
  const cotizacion = buscarCotizacion(id);
  const cuerpo = await leerJson(req);
  const destino = cuerpo['step'];
  if (typeof destino !== 'string') throw new ErrorDeCliente('falta `step`');

  const salidas =
    cotizacion.paso.kind === 'waiting' ? [] : cotizacion.paso.actions.map((a) => a.step);
  // Se navega a una salida del paso actual, o a un paso por el que esta misma
  // cotización ya pasó —el botón de volver—. Lo que no se puede es inventar un
  // id y terminar en una pantalla incoherente, que es de lo que cuida este
  // control: las dos listas las escribió el servidor, no el front.
  const atras = cotizacion.visitados.indexOf(destino);
  if (!salidas.includes(destino) && atras === -1) {
    throw new ErrorDeCliente(`el paso actual no ofrece ir a "${destino}"`);
  }

  const { session, step } = await motor.goTo(destino, cotizacion.session);
  cotizacion.session = session;
  cotizacion.paso = step;
  // Volver corta el camino donde estaba ese paso; una salida lateral lo sigue.
  if (atras !== -1) cotizacion.visitados.length = atras + 1;
  else cotizacion.visitados.push(step.id);
  responder(res, 200, paraElFront(id, cotizacion));
}

/** Trae la lista de un paso con buscador (modelos, versiones, localidades…). */
async function opciones(res: ServerResponse, id: string, search: string): Promise<void> {
  const cotizacion = buscarCotizacion(id);
  const paso = cotizacion.paso;
  if (paso.kind !== 'choice' || paso.optionsSource === undefined) {
    throw new ErrorDeCliente('el paso actual no pide opciones a un catálogo');
  }
  const lista = await motor.loadOptions(paso.optionsSource, cotizacion.session, search);
  responder(res, 200, { opciones: lista });
}

/**
 * Foto del estado de la cotización.
 *
 * El front pollea esto igual que el multi: el motor nunca avisa que terminó,
 * así que cada respuesta trae lo que haya hasta el momento.
 */
async function resultados(res: ServerResponse, id: string): Promise<void> {
  const cotizacion = buscarCotizacion(id);
  if (!cotizacion.cotizando) {
    throw new ErrorDeCliente('la cotización todavía no se disparó');
  }
  const quotations: Quotations = await motor.quotations(cotizacion.session);
  responder(res, 200, quotations);
}

/** Elige un plan: cierra la etapa 2 y habilita la contratación. */
async function elegir(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
  const cotizacion = buscarCotizacion(id);
  const cuerpo = await leerJson(req);
  const { code, insurance, plan } = cuerpo;
  if (typeof code !== 'string' || typeof insurance !== 'string' || typeof plan !== 'string') {
    throw new ErrorDeCliente('faltan `code`, `insurance` o `plan`');
  }

  await motor.elegirPlan(cotizacion.session, { code, insurance, plan });
  responder(res, 200, { elegido: { code, insurance, plan }, valores: cotizacion.valores });
}

/**
 * Genera la constancia y la devuelve para descargar.
 *
 * No guarda nada: recibe los datos, arma el PDF y lo entrega. Es la misma
 * constancia que se adjunta al correo.
 */
async function certificado(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const cuerpo = await leerJsonOFormulario(req);
  const datos = cuerpo as unknown as DatosCertificado;

  if (
    typeof datos.asegurado?.nombre !== 'string' ||
    typeof datos.vehiculo?.patente !== 'string' ||
    typeof datos.poliza?.aseguradora !== 'string'
  ) {
    throw new ErrorDeCliente('faltan datos para armar la constancia');
  }

  const pdf = await generarCertificado({
    ...datos,
    // Las fechas viajan como texto en JSON.
    poliza: { ...datos.poliza, fechaCarga: new Date(datos.poliza.fechaCarga) },
  });

  const nombre = `constancia-${datos.vehiculo.patente || 'emision'}.pdf`;
  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': pdf.length,
    'Content-Disposition': `attachment; filename="${nombre}"`,
  });
  res.end(pdf);
}

/**
 * Envía la solicitud de emisión por correo.
 *
 * Genera la constancia, la adjunta junto a las fotos y manda todo. No persiste
 * nada: el correo es el registro. Si el envío falla después de los reintentos,
 * responde 502 con el motivo para que el front pueda avisar y ofrecer la
 * descarga de la constancia.
 */
async function solicitud(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // El único endpoint con adjuntos: las fotos y la cédula viajan acá adentro.
  const cuerpo = await leerJson(req, limiteSolicitud());
  const datos = cuerpo['certificado'] as unknown as DatosCertificado | undefined;
  const correo = cuerpo['correo'] as unknown as Solicitud | undefined;

  if (datos === undefined || correo === undefined) {
    throw new ErrorDeCliente('faltan `certificado` o `correo`');
  }
  if (!correoConfigurado()) {
    throw new ErrorDeCliente(
      'el correo no está configurado: definí SMTP_HOST y MAIL_TO en el servidor',
    );
  }

  const constancia = await generarCertificado({
    ...datos,
    poliza: { ...datos.poliza, fechaCarga: new Date(datos.poliza.fechaCarga) },
  });

  // Primero el correo interno: es el que habilita la emisión y, sin base de
  // datos, el único registro de la operación.
  const resultado = await enviarSolicitud(correo, constancia);
  if (!resultado.enviado) {
    responder(res, 502, {
      error: `No pudimos enviar la solicitud: ${resultado.error ?? 'error desconocido'}`,
      intentos: resultado.intentos,
    });
    return;
  }

  // Después, la constancia al comprador. Si esto falla, la solicitud ya llegó a
  // emisiones: se informa, pero no se pierde la operación.
  let constanciaAlCliente: { enviada: boolean; error?: string } = { enviada: false };
  if (correo.emailCliente !== undefined && correo.emailCliente.includes('@')) {
    const alCliente = await enviarConstanciaAlCliente(
      correo.emailCliente,
      correo.nombreCliente,
      constancia,
    );
    constanciaAlCliente = alCliente.enviado
      ? { enviada: true }
      : { enviada: false, error: alCliente.error ?? 'error desconocido' };
  }

  responder(res, 200, {
    enviado: true,
    intentos: resultado.intentos,
    // El front lo muestra: es el comprobante de que la solicitud salió.
    referencia: resultado.messageId,
    constanciaAlCliente,
  });
}

// ── servidor ───────────────────────────────────────────────────────────

/**
 * Endpoints que cuestan: mandan correo o arman un PDF.
 *
 * Son los que hay que limitar. Los pasos del cotizador no: el vendedor los
 * recorre de a muchos y quedan cubiertos por el TTL de la cotización.
 */
const CAROS = new Set(['solicitud', 'certificado']);

const servidor = createServer((req, res) => {
  void (async () => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const partes = url.pathname.split('/').filter((p) => p !== '');
      const metodo = req.method ?? 'GET';
      const origen = req.headers.origin;

      // Antes que nada: de dónde viene. Rechazar acá evita hacer el trabajo
      // —mandar un correo, armar un PDF— para una respuesta que el navegador
      // igual iba a esconder.
      const veredicto = evaluarOrigen(origen, req.headers.host);
      for (const [nombre, valor] of Object.entries(cabecerasDeSeguridad())) {
        res.setHeader(nombre, valor);
      }
      if (!veredicto.permitido) {
        console.warn('[cors]', veredicto.motivo);
        responder(res, 403, { error: 'origen no permitido' });
        return;
      }
      for (const [nombre, valor] of Object.entries(veredicto.cabeceras)) {
        res.setHeader(nombre, valor);
      }

      // El preflight no llega a ninguna ruta: se contesta y listo.
      if (esPreflight(metodo, origen)) {
        res.writeHead(204).end();
        return;
      }

      if (partes[0] !== 'api') {
        responder(res, 404, { error: 'ruta desconocida' });
        return;
      }

      if (partes[1] !== undefined && CAROS.has(partes[1]) && metodo === 'POST') {
        const cupo = consumirCupo(`${partes[1]}:${ipDe(req)}`);
        if (!cupo.permitido) {
          res.setHeader('Retry-After', String(cupo.esperaSegundos));
          responder(res, 429, {
            error: 'demasiados pedidos desde esta dirección; probá de nuevo más tarde',
            esperaSegundos: cupo.esperaSegundos,
          });
          return;
        }
      }

      if (partes[1] === 'certificado' && metodo === 'POST') {
        return await certificado(req, res);
      }
      if (partes[1] === 'solicitud' && metodo === 'POST') {
        return await solicitud(req, res);
      }

      // /api/cotizaciones[/:id[/accion]]
      if (partes[1] !== 'cotizaciones') {
        responder(res, 404, { error: 'ruta desconocida' });
        return;
      }

      const id = partes[2];
      const accion = partes[3];

      if (id === undefined && metodo === 'POST') return await crear(res);
      if (id !== undefined && accion === 'pasos' && metodo === 'POST') {
        return await avanzar(req, res, id);
      }
      if (id !== undefined && accion === 'ir' && metodo === 'POST') {
        return await ir(req, res, id);
      }
      if (id !== undefined && accion === 'opciones' && metodo === 'GET') {
        return await opciones(res, id, url.searchParams.get('search') ?? '');
      }
      if (id !== undefined && accion === 'resultados' && metodo === 'GET') {
        return await resultados(res, id);
      }
      if (id !== undefined && accion === 'elegir' && metodo === 'POST') {
        return await elegir(req, res, id);
      }

      responder(res, 404, { error: 'ruta desconocida' });
    } catch (error) {
      if (error instanceof ErrorDeCliente) {
        responder(res, 400, { error: error.message });
        return;
      }
      if (error instanceof ErrorDemasiadoGrande) {
        responder(res, 413, { error: error.message });
        // El resto del cuerpo ya no se va a leer: se corta la conexión recién
        // después de que la respuesta salió, para que el cliente vea el 413 y
        // no un corte seco.
        res.on('finish', () => req.destroy());
        return;
      }
      // Un cambio de markup del motor no es un error del usuario: se reporta
      // como 502 y con el detalle, que es lo que hace falta para arreglarlo.
      if (error instanceof MotorParseError) {
        console.error('[motor]', error.message, error.context);
        responder(res, 502, { error: error.message, contexto: error.context });
        return;
      }
      if (error instanceof MotorHttpError) {
        console.error('[motor]', error.message);
        responder(res, 502, { error: error.message });
        return;
      }
      console.error('[bff]', error);
      responder(res, 500, { error: 'error inesperado' });
    }
  })();
});

/** Las ventanas vencidas del rate limit no le sirven a nadie. */
setInterval(() => limpiarCupos(), 10 * 60 * 1000).unref();

servidor.listen(PUERTO, () => {
  console.log(`BFF escuchando en http://localhost:${PUERTO}`);
  console.log(`motor: ${process.env['MOTOR_URL'] ?? 'https://infinito.foxia.ar'}`);
  console.log(`orígenes permitidos: ${origenesPermitidos().join(', ')}`);
  console.log(`sitios que pueden embeber: ${sitiosEmbebibles().join(', ') || 'ninguno'}`);
  if (!hayAllowlist()) {
    console.warn(
      '[seguridad] SITIOS_EMBEBIBLES no está definida: ningún sitio externo puede ' +
        'embeber la app. En producción hay que definirla con los dos sitios de agencia.',
    );
  }
});

/**
 * Cierre ordenado.
 *
 * Sin esto, al recargar en desarrollo el proceso nuevo arranca antes de que el
 * viejo suelte el puerto y falla con EADDRINUSE. Cerrar el listener y las
 * conexiones abiertas lo evita, y en producción permite terminar las peticiones
 * en curso antes de salir.
 */
const conexiones = new Set<import('node:net').Socket>();
servidor.on('connection', (socket) => {
  conexiones.add(socket);
  socket.on('close', () => conexiones.delete(socket));
});

let cerrando = false;
const cerrar = () => {
  if (cerrando) return;
  cerrando = true;
  servidor.close(() => process.exit(0));
  for (const socket of conexiones) socket.destroy();
  // Si algo queda colgado, no bloquear el reinicio.
  setTimeout(() => process.exit(0), 2_000).unref();
};

process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
process.on('SIGHUP', cerrar);
