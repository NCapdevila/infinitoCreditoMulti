import { afterEach, describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import {
  ErrorDemasiadoGrande,
  VENTANA_MS,
  cabecerasDeSeguridad,
  consumirCupo,
  esPreflight,
  evaluarOrigen,
  ipDe,
  leerCuerpoLimitado,
  normalizarOrigen,
  origenesPermitidos,
  reiniciarCupos,
  sitiosEmbebibles,
} from '../src/seguridad.js';

/**
 * El BFF manda correos y arma PDFs sin pedirle credenciales a nadie: lo único
 * que hay entre `/api/solicitud` y un relay abierto es lo que se prueba acá.
 */

const entorno = { ...process.env };
afterEach(() => {
  process.env = { ...entorno };
  reiniciarCupos();
});

const SITIOS = 'https://www.agencia-uno.com.ar,https://agencia-dos.com.ar';

describe('normalización de orígenes', () => {
  it('ignora mayúsculas, barra final y path', () => {
    expect(normalizarOrigen('HTTPS://Agencia.com.ar/')).toBe('https://agencia.com.ar');
    expect(normalizarOrigen('https://agencia.com.ar/cotizador?x=1')).toBe('https://agencia.com.ar');
  });

  it('conserva el puerto, que es parte del origen', () => {
    expect(normalizarOrigen('http://localhost:5180')).toBe('http://localhost:5180');
    // El puerto por defecto no se escribe: si no, `https://a.com` y
    // `https://a.com:443` serían dos orígenes distintos.
    expect(normalizarOrigen('https://agencia.com.ar:443')).toBe('https://agencia.com.ar');
  });

  it('descarta lo que no es un origen http(s)', () => {
    expect(normalizarOrigen('')).toBeUndefined();
    expect(normalizarOrigen('agencia.com.ar')).toBeUndefined();
    expect(normalizarOrigen('file:///tmp')).toBeUndefined();
    expect(normalizarOrigen('javascript:alert(1)')).toBeUndefined();
  });

  it('descarta las entradas rotas de la variable sin tirar las buenas', () => {
    process.env['ORIGENES_PERMITIDOS'] = 'https://buena.com.ar, , no-es-un-origen';
    expect(origenesPermitidos()).toEqual(['https://buena.com.ar']);
  });
});

describe('quién puede llamar a la API', () => {
  it('deja pasar sin Origin: no hay navegador y CORS no aplica', () => {
    const veredicto = evaluarOrigen(undefined, 'cotizador.cebrokers.com.ar');
    expect(veredicto.permitido).toBe(true);
  });

  it('deja pasar el mismo origen aunque no esté en la lista', () => {
    process.env['ORIGENES_PERMITIDOS'] = 'https://otra.com.ar';
    const veredicto = evaluarOrigen(
      'https://cotizador.cebrokers.com.ar',
      'cotizador.cebrokers.com.ar',
    );
    expect(veredicto.permitido, 'el front y el BFF comparten dominio').toBe(true);
    if (!veredicto.permitido) return;
    // Mismo origen no necesita CORS: mandar la cabecera sería ruido.
    expect(veredicto.cabeceras['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('rechaza un origen ajeno', () => {
    process.env['ORIGENES_PERMITIDOS'] = 'https://agencia-uno.com.ar';
    const veredicto = evaluarOrigen('https://sitio-cualquiera.com', 'cotizador.cebrokers.com.ar');
    expect(veredicto.permitido).toBe(false);
  });

  it('rechaza el origen `null` de un iframe sandboxeado', () => {
    process.env['ORIGENES_PERMITIDOS'] = 'https://agencia-uno.com.ar';
    expect(evaluarOrigen('null', 'cotizador.cebrokers.com.ar').permitido).toBe(false);
  });

  it('autoriza un origen de la lista devolviéndolo, nunca `*`', () => {
    process.env['ORIGENES_PERMITIDOS'] = SITIOS;
    const veredicto = evaluarOrigen('https://agencia-dos.com.ar', 'api.cebrokers.com.ar');
    expect(veredicto.permitido).toBe(true);
    if (!veredicto.permitido) return;
    expect(veredicto.cabeceras['Access-Control-Allow-Origin']).toBe('https://agencia-dos.com.ar');
    expect(veredicto.cabeceras['Vary'], 'sin Vary un caché puede cruzar respuestas').toBe('Origin');
  });

  it('sin variable definida sólo anda en desarrollo', () => {
    delete process.env['ORIGENES_PERMITIDOS'];
    expect(evaluarOrigen('http://localhost:5180', 'localhost:5181').permitido).toBe(true);
    expect(evaluarOrigen('https://sitio-cualquiera.com', 'localhost:5181').permitido).toBe(false);
  });

  it('reconoce el preflight sólo si viene de un navegador', () => {
    expect(esPreflight('OPTIONS', 'https://agencia-dos.com.ar')).toBe(true);
    expect(esPreflight('OPTIONS', undefined)).toBe(false);
    expect(esPreflight('POST', 'https://agencia-dos.com.ar')).toBe(false);
  });
});

describe('quién puede embeber la app', () => {
  it('lista los sitios declarados', () => {
    process.env['SITIOS_EMBEBIBLES'] = SITIOS;
    expect(sitiosEmbebibles()).toEqual([
      'https://www.agencia-uno.com.ar',
      'https://agencia-dos.com.ar',
    ]);
    expect(cabecerasDeSeguridad()['Content-Security-Policy']).toBe(
      "frame-ancestors 'self' https://www.agencia-uno.com.ar https://agencia-dos.com.ar",
    );
  });

  it('sin variable, no la embebe nadie: el default seguro', () => {
    delete process.env['SITIOS_EMBEBIBLES'];
    expect(cabecerasDeSeguridad()['Content-Security-Policy']).toBe("frame-ancestors 'self'");
  });

  it('no mezcla las dos listas: embeber y llamar a la API son cosas distintas', () => {
    process.env['SITIOS_EMBEBIBLES'] = 'https://agencia-uno.com.ar';
    process.env['ORIGENES_PERMITIDOS'] = 'https://cotizador.cebrokers.com.ar';
    // Dentro del iframe el fetch sale con el origen de la app, no con el del
    // sitio que la embebe: que un sitio pueda embeberla no lo habilita a
    // llamar a la API por su cuenta.
    expect(evaluarOrigen('https://agencia-uno.com.ar', 'api.cebrokers.com.ar').permitido).toBe(
      false,
    );
  });
});

describe('rate limit', () => {
  it('corta al llegar al tope y avisa cuánto esperar', () => {
    process.env['LIMITE_POR_HORA'] = '3';
    const ahora = Date.now();
    for (let i = 0; i < 3; i++) {
      expect(consumirCupo('solicitud:1.2.3.4', ahora).permitido, `intento ${i + 1}`).toBe(true);
    }
    const cuarto = consumirCupo('solicitud:1.2.3.4', ahora);
    expect(cuarto.permitido).toBe(false);
    expect(cuarto.esperaSegundos).toBeGreaterThan(0);
  });

  it('cuenta por clave: una IP no consume el cupo de otra', () => {
    process.env['LIMITE_POR_HORA'] = '1';
    const ahora = Date.now();
    expect(consumirCupo('solicitud:1.2.3.4', ahora).permitido).toBe(true);
    expect(consumirCupo('solicitud:5.6.7.8', ahora).permitido).toBe(true);
    expect(consumirCupo('solicitud:1.2.3.4', ahora).permitido).toBe(false);
  });

  it('abre una ventana nueva cuando vence la anterior', () => {
    process.env['LIMITE_POR_HORA'] = '1';
    const ahora = Date.now();
    expect(consumirCupo('solicitud:1.2.3.4', ahora).permitido).toBe(true);
    expect(consumirCupo('solicitud:1.2.3.4', ahora).permitido).toBe(false);
    expect(consumirCupo('solicitud:1.2.3.4', ahora + VENTANA_MS + 1).permitido).toBe(true);
  });
});

const peticion = (headers: Record<string, string>, socket = { remoteAddress: '1.2.3.4' }) =>
  ({ headers, socket }) as unknown as IncomingMessage;

describe('de qué IP viene', () => {
  it('usa la del socket si no se declara un proxy adelante', () => {
    delete process.env['CONFIAR_EN_PROXY'];
    // Sin proxy declarado, X-Forwarded-For la escribe cualquiera: creerle
    // sería dejar que se salteen el límite cambiando una cabecera.
    expect(ipDe(peticion({ 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4');
  });

  it('con proxy declarado toma la primera de la cadena', () => {
    process.env['CONFIAR_EN_PROXY'] = '1';
    expect(ipDe(peticion({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
  });
});

/** Un cuerpo que llega de a pedazos, como en la vida real. */
const cuerpoDe = (texto: string, headers: Record<string, string> = {}) =>
  ({
    headers,
    async *[Symbol.asyncIterator]() {
      for (const parte of texto.match(/.{1,8}/gs) ?? []) yield Buffer.from(parte);
    },
  }) as unknown as IncomingMessage;

describe('tope del cuerpo', () => {
  it('lee normal lo que entra en el tope', async () => {
    await expect(leerCuerpoLimitado(cuerpoDe('{"hola":"mundo"}'), 1024)).resolves.toBe(
      '{"hola":"mundo"}',
    );
  });

  it('corta por Content-Length antes de recibir un byte', async () => {
    await expect(
      leerCuerpoLimitado(cuerpoDe('x', { 'content-length': String(50 * 1024 * 1024) }), 1024),
    ).rejects.toBeInstanceOf(ErrorDemasiadoGrande);
  });

  it('corta igual si el Content-Length miente o no viene', async () => {
    // Es el caso que importa: un cliente hostil no va a declarar el tamaño real.
    await expect(
      leerCuerpoLimitado(cuerpoDe('x'.repeat(5000), { 'content-length': '10' }), 1024),
    ).rejects.toBeInstanceOf(ErrorDemasiadoGrande);
    await expect(leerCuerpoLimitado(cuerpoDe('x'.repeat(5000)), 1024)).rejects.toBeInstanceOf(
      ErrorDemasiadoGrande,
    );
  });
});
