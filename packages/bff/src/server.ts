import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { generarCertificado } from './certificado.js';
import {
  correoConfigurado,
  enviarConstanciaAlCliente,
  enviarSolicitud,
  type Solicitud,
} from './correo.js';
import { validarAdjuntos } from './adjuntos.js';
import { Cotizaciones, type Cotizacion } from './cotizaciones.js';
import {
  asuntoDeSolicitud,
  contactoDelCliente,
  datosDeEmision,
  planDeResultados,
  seccionesDeSolicitud,
} from './emision.js';
import { ErrorDeCliente, ErrorHttp } from './errores.js';
import { directorioWeb, leerDocumento, leerEstatico, paginaDeRechazo } from './estaticos.js';
import { MotorClient, MotorHttpError } from './motor/client.js';
import { MotorParseError } from './motor/types.js';
import type { Quotations } from './motor/quotations.js';
import {
  MENSAJE_RECHAZO,
  configRecaptcha,
  problemaDeConfiguracion as problemaDeRecaptcha,
  verificarRecaptcha,
  type Accion,
} from './recaptcha.js';
import {
  autorizarApi,
  emitirPase,
  esProduccion,
  evaluarDocumento,
  inyectarPase,
  problemaDeConfiguracion,
  secretoDelPase,
} from './pase.js';
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
 * API del cotizador, y en producción también el front.
 *
 * Traduce el motor htmx a JSON. El front nunca ve HTML, ni el token de sesión,
 * ni el CSRF: eso queda de este lado, que además es lo correcto — el CSRF rota
 * en cada respuesta y mandarlo al browser sólo daría oportunidad de perderlo.
 *
 * Todo `/api` exige el pase de embebido que emite este mismo proceso al servir
 * el HTML: ver `pase.ts`.
 */

const PUERTO = Number.parseInt(process.env['PORT'] ?? '5181', 10);

const motor = new MotorClient({
  baseUrl: process.env['MOTOR_URL'] ?? 'https://infinito.foxia.ar',
  uuid: process.env['MOTOR_UUID'] ?? '994b4085-999d-4301-9531-607ff61fca42',
});

const cotizaciones = new Cotizaciones();
setInterval(() => cotizaciones.limpiar(), 5 * 60 * 1000).unref();

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

/** Sólo lo que el front necesita: nada de sesión ni de CSRF. */
const paraElFront = (id: string, c: Cotizacion) => ({
  id,
  paso: c.paso,
  cotizando: c.cotizando,
  /** A dónde lleva el botón de volver, o `null` si es el primer paso. */
  anterior: c.visitados[c.visitados.length - 2] ?? null,
});

// ── rutas ──────────────────────────────────────────────────────────────

async function crear(res: ServerResponse, origen: string): Promise<void> {
  const { session, step } = await motor.start();
  const id = randomUUID();
  const ahora = Date.now();
  const cotizacion: Cotizacion = {
    session,
    paso: step,
    valores: {},
    cotizando: false,
    visitados: [step.id],
    origen,
    creada: ahora,
    usada: ahora,
    solicitud: 'pendiente',
  };
  cotizaciones.guardar(id, cotizacion);
  responder(res, 201, paraElFront(id, cotizacion));
}

/**
 * Completa el paso actual y devuelve el siguiente.
 *
 * Si el motor contesta con la pantalla de espera, ya tiene todo: se dispara la
 * cotización y a partir de ahí el front pide resultados.
 */
async function avanzar(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
  origen: string,
): Promise<void> {
  const cotizacion = cotizaciones.buscar(id, origen);
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
async function ir(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
  origen: string,
): Promise<void> {
  const cotizacion = cotizaciones.buscar(id, origen);
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
async function opciones(
  res: ServerResponse,
  id: string,
  origen: string,
  search: string,
): Promise<void> {
  const cotizacion = cotizaciones.buscar(id, origen);
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
async function resultados(res: ServerResponse, id: string, origen: string): Promise<void> {
  const cotizacion = cotizaciones.buscar(id, origen);
  if (!cotizacion.cotizando) {
    throw new ErrorDeCliente('la cotización todavía no se disparó');
  }
  const quotations: Quotations = await motor.quotations(cotizacion.session);
  responder(res, 200, quotations);
}

/**
 * Elige un plan: cierra la etapa 2 y habilita la contratación.
 *
 * El plan se busca en los resultados del motor y se guarda de ahí, no de lo
 * que manda el front: es lo que después sale en la constancia y en el correo.
 */
async function elegir(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
  origen: string,
): Promise<void> {
  const cotizacion = cotizaciones.buscar(id, origen);
  const cuerpo = await leerJson(req);
  const { code, insurance, plan } = cuerpo;
  if (typeof code !== 'string' || typeof insurance !== 'string' || typeof plan !== 'string') {
    throw new ErrorDeCliente('faltan `code`, `insurance` o `plan`');
  }
  if (!cotizacion.cotizando) {
    throw new ErrorDeCliente('la cotización todavía no se disparó');
  }
  if (cotizacion.solicitud !== 'pendiente') {
    throw new ErrorHttp(409, 'La solicitud de esta cotización ya se envió: para otro plan, cotizá de nuevo.');
  }

  const elegido = planDeResultados(await motor.quotations(cotizacion.session), {
    code,
    insurance,
    plan,
  });
  if (elegido === undefined) {
    throw new ErrorDeCliente('el plan elegido no está entre los resultados de la cotización');
  }

  await motor.elegirPlan(cotizacion.session, {
    code: elegido.code,
    insurance: elegido.compania,
    plan: elegido.plan,
  });
  cotizacion.plan = elegido;
  responder(res, 200, { elegido, valores: cotizacion.valores });
}

/**
 * Genera la constancia y la devuelve para descargar.
 *
 * Pide la cotización de la que sale: vigente, de esta agencia y con plan. La
 * compañía, la cobertura y el vehículo cotizado salen de ahí, no del pedido.
 * Se puede descargar las veces que haga falta.
 */
async function certificado(req: IncomingMessage, res: ServerResponse, origen: string): Promise<void> {
  const cuerpo = await leerJsonOFormulario(req);
  const cotizacion = cotizaciones.paraEmitir(cuerpo['cotizacionId'], origen);
  const datos = datosDeEmision(cuerpo, cotizacion);

  const pdf = await generarCertificado(datos);
  const nombre = `constancia-${datos.vehiculo.patente.replace(/\s+/g, '-') || 'emision'}.pdf`;
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
async function solicitud(req: IncomingMessage, res: ServerResponse, origen: string): Promise<void> {
  // El único endpoint con adjuntos: las fotos y la cédula viajan acá adentro.
  const cuerpo = await leerJson(req, limiteSolicitud());
  const cotizacion = cotizaciones.paraEmitir(cuerpo['cotizacionId'], origen);

  const delCliente = cuerpo['correo'];
  if (typeof cuerpo['certificado'] !== 'object' || typeof delCliente !== 'object' || delCliente === null) {
    throw new ErrorDeCliente('faltan `certificado` o `correo`');
  }
  const correoDelCliente = delCliente as Record<string, unknown>;
  const datos = datosDeEmision(cuerpo['certificado'], cotizacion);
  const contacto = contactoDelCliente(correoDelCliente['emailCliente'], correoDelCliente['nombreCliente']);

  if (!correoConfigurado()) {
    throw new ErrorDeCliente(
      'el correo no está configurado: definí SMTP_HOST y MAIL_TO en el servidor',
    );
  }

  const correo: Solicitud = {
    asunto: asuntoDeSolicitud(cotizacion.plan, datos.vehiculo.patente),
    secciones: seccionesDeSolicitud(correoDelCliente['secciones'], cotizacion.plan),
    // Tipo por firma de los bytes y nombre puesto acá: ver `adjuntos.ts`.
    adjuntos: validarAdjuntos(correoDelCliente['adjuntos']),
    ...contacto,
  };
  const constancia = await generarCertificado(datos);

  // Se reserva antes de mandar, no después: dos pedidos simultáneos pasarían
  // los dos el chequeo mientras el primero todavía está enviando.
  cotizaciones.reservarSolicitud(cotizacion);
  let resultado: Awaited<ReturnType<typeof enviarSolicitud>>;
  try {
    // Primero el correo interno: es el que habilita la emisión y, sin base de
    // datos, el único registro de la operación.
    resultado = await enviarSolicitud(correo, constancia);
  } catch (error) {
    cotizaciones.liberarSolicitud(cotizacion);
    throw error;
  }
  if (!resultado.enviado) {
    cotizaciones.liberarSolicitud(cotizacion);
    responder(res, 502, {
      error: `No pudimos enviar la solicitud: ${resultado.error ?? 'error desconocido'}`,
      intentos: resultado.intentos,
    });
    return;
  }

  cotizaciones.confirmarSolicitud(cotizacion);

  // Después, la constancia al comprador. Si esto falla, la solicitud ya llegó a
  // emisiones: se informa, pero no se pierde la operación.
  let constanciaAlCliente: { enviada: boolean; error?: string } = { enviada: false };
  if (correo.emailCliente !== undefined) {
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

// ── el front ───────────────────────────────────────────────────────────

const cabecera = (req: IncomingMessage, nombre: string) => {
  const valor = req.headers[nombre];
  return Array.isArray(valor) ? valor[0] : valor;
};

/**
 * El HTML del cotizador, con su pase.
 *
 * `no-store` porque cada copia lleva un pase distinto: un caché intermedio que
 * la guardara le daría a todo el mundo el pase de la primera agencia.
 */
async function documento(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const veredicto = evaluarDocumento({
    destino: cabecera(req, 'sec-fetch-dest'),
    referer: cabecera(req, 'referer'),
    host: cabecera(req, 'host'),
  });
  if (!veredicto.permitido) {
    console.warn(`[pase] ${veredicto.motivo}`);
    const html = paginaDeRechazo();
    res.writeHead(403, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
      'Cache-Control': 'no-store',
    });
    res.end(html);
    return;
  }

  const html = await leerDocumento(directorioWeb());
  if (html === undefined) {
    responder(res, 503, { error: 'el front no está compilado: correr `npm run build`' });
    return;
  }

  const conPase = inyectarPase(html, emitirPase(veredicto.origen, secretoDelPase()));
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(conPase),
    'Cache-Control': 'no-store',
  });
  res.end(conPase);
}

async function estatico(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  const archivo = await leerEstatico(directorioWeb(), pathname);
  if (archivo === undefined) {
    responder(res, 404, { error: 'ruta desconocida' });
    return;
  }
  res.writeHead(200, {
    'Content-Type': archivo.tipo,
    'Content-Length': archivo.contenido.length,
    'Cache-Control': archivo.cache,
  });
  res.end(req.method === 'HEAD' ? undefined : archivo.contenido);
}

/**
 * Exige un token de reCAPTCHA para `accion`.
 *
 * Devuelve `false` si ya contestó el rechazo. Deja una línea en el log por
 * cada verificación, con la acción y el puntaje y sin datos de la operación:
 * es lo que hace falta para ajustar el umbral con el tráfico real.
 */
async function exigirRecaptcha(
  req: IncomingMessage,
  res: ServerResponse,
  accion: Accion,
): Promise<boolean> {
  const config = configRecaptcha();
  // Sólo en desarrollo y sin secreto: se avisó al arrancar.
  if (config === undefined) return true;

  const resultado = await verificarRecaptcha(cabecera(req, 'x-recaptcha'), accion, config);
  const score = resultado.score ?? '-';
  if (resultado.valido) {
    console.log(`[recaptcha] ${accion} · score ${score} · ok`);
    return true;
  }
  console.warn(`[recaptcha] ${accion} · score ${score} · rechazado: ${resultado.motivo}`);
  responder(res, resultado.status, { error: MENSAJE_RECHAZO });
  return false;
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
        if (metodo !== 'GET' && metodo !== 'HEAD') {
          responder(res, 405, { error: 'método no permitido' });
          return;
        }
        if (url.pathname === '/' || url.pathname === '/index.html') {
          return await documento(req, res);
        }
        return await estatico(req, res, url.pathname);
      }

      // Todo `/api` pide el pase. Va antes que el rate limit: un pedido sin
      // pase no tiene por qué gastarle el cupo a nadie.
      const autorizacion = autorizarApi(cabecera(req, 'authorization'), secretoDelPase());
      if (!autorizacion.autorizado) {
        console.warn(`[pase] ${autorizacion.motivo} · ${metodo} ${url.pathname}`);
        responder(res, 401, {
          error: 'La sesión del cotizador venció o no es válida. Recargá la página.',
        });
        return;
      }
      const agencia = autorizacion.origen;

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

      // El reCAPTCHA va después del rate limit: verificarlo es una llamada a
      // Google, y no tiene sentido hacerla para un pedido que ya se pasó del cupo.
      if (partes[1] === 'certificado' && metodo === 'POST') {
        if (!(await exigirRecaptcha(req, res, 'constancia'))) return;
        return await certificado(req, res, agencia);
      }
      if (partes[1] === 'solicitud' && metodo === 'POST') {
        if (!(await exigirRecaptcha(req, res, 'solicitud'))) return;
        return await solicitud(req, res, agencia);
      }

      // /api/cotizaciones[/:id[/accion]]
      if (partes[1] !== 'cotizaciones') {
        responder(res, 404, { error: 'ruta desconocida' });
        return;
      }

      const id = partes[2];
      const accion = partes[3];

      if (id === undefined && metodo === 'POST') {
        // Crear abre una sesión en el motor: es lo que un script repetiría.
        if (!(await exigirRecaptcha(req, res, 'cotizar'))) return;
        return await crear(res, agencia);
      }
      if (id !== undefined && accion === 'pasos' && metodo === 'POST') {
        return await avanzar(req, res, id, agencia);
      }
      if (id !== undefined && accion === 'ir' && metodo === 'POST') {
        return await ir(req, res, id, agencia);
      }
      if (id !== undefined && accion === 'opciones' && metodo === 'GET') {
        return await opciones(res, id, agencia, url.searchParams.get('search') ?? '');
      }
      if (id !== undefined && accion === 'resultados' && metodo === 'GET') {
        return await resultados(res, id, agencia);
      }
      if (id !== undefined && accion === 'elegir' && metodo === 'POST') {
        return await elegir(req, res, id, agencia);
      }

      responder(res, 404, { error: 'ruta desconocida' });
    } catch (error) {
      if (error instanceof ErrorHttp) {
        responder(res, error.status, { error: error.message });
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

// Un secreto mal configurado en producción no es algo para descubrir con el
// primer pase rechazado: el proceso no arranca.
for (const [etiqueta, problema] of [
  ['pase', problemaDeConfiguracion()],
  ['recaptcha', problemaDeRecaptcha()],
] as const) {
  if (problema !== undefined) {
    console.error(`[${etiqueta}] ${problema}`);
    process.exit(1);
  }
}

servidor.listen(PUERTO, () => {
  console.log(`BFF escuchando en http://localhost:${PUERTO}`);
  console.log(`motor: ${process.env['MOTOR_URL'] ?? 'https://infinito.foxia.ar'}`);
  console.log(`orígenes permitidos: ${origenesPermitidos().join(', ')}`);
  console.log(`sitios que pueden embeber: ${sitiosEmbebibles().join(', ') || 'ninguno'}`);
  if (!esProduccion()) {
    const secreto = process.env['PASE_SECRETO'] ? '' : ', y los pases se firman con el secreto público de desarrollo';
    console.warn(
      `[pase] modo desarrollo (NODE_ENV no es production): se puede abrir el cotizador directo desde localhost${secreto}`,
    );
  }
  if (configRecaptcha() === undefined) {
    console.warn(
      '[recaptcha] RECAPTCHA_SECRETO no está definida: en desarrollo se saltea la verificación',
    );
  }
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
