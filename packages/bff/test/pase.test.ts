import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Cotizaciones, type Cotizacion } from '../src/cotizaciones.js';
import { ErrorHttp } from '../src/errores.js';
import { cacheDe, leerEstatico } from '../src/estaticos.js';
import {
  DURACION_PASE_MS,
  autorizarApi,
  emitirPase,
  evaluarDocumento,
  inyectarPase,
  paseDeCabecera,
  problemaDeConfiguracion,
  secretoDelPase,
  verificarPase,
} from '../src/pase.js';

/**
 * El pase es lo que separa al cotizador cargado desde una agencia de alguien que
 * abre la URL o llama a `/api` por su cuenta.
 */

const entorno = { ...process.env };
afterEach(() => {
  process.env = { ...entorno };
});

const SECRETO = 'un-secreto-de-prueba-con-mas-de-treinta-y-dos-caracteres';
const AGENCIA = 'https://www.agencia-uno.com.ar';
const AHORA = Date.UTC(2026, 8, 16, 12, 0, 0);

const enProduccion = () => {
  process.env['NODE_ENV'] = 'production';
  process.env['SITIOS_EMBEBIBLES'] = `${AGENCIA},https://agencia-dos.com.ar`;
};

describe('el token', () => {
  it('un pase recién emitido es válido y dice de qué agencia es', () => {
    const resultado = verificarPase(emitirPase(AGENCIA, SECRETO, AHORA), SECRETO, AHORA);
    expect(resultado.valido).toBe(true);
    if (resultado.valido) expect(resultado.pase.origen).toBe(AGENCIA);
  });

  it('vence a las dos horas', () => {
    const token = emitirPase(AGENCIA, SECRETO, AHORA);
    expect(verificarPase(token, SECRETO, AHORA + DURACION_PASE_MS - 1000).valido).toBe(true);
    expect(verificarPase(token, SECRETO, AHORA + DURACION_PASE_MS)).toEqual({
      valido: false,
      motivo: 'vencido',
    });
  });

  it('rechaza una firma alterada', () => {
    const token = emitirPase(AGENCIA, SECRETO, AHORA);
    const ultimo = token.at(-1) === 'A' ? 'B' : 'A';
    expect(verificarPase(token.slice(0, -1) + ultimo, SECRETO, AHORA)).toEqual({
      valido: false,
      motivo: 'firma inválida',
    });
  });

  it('rechaza datos cambiados aunque la firma sea la original', () => {
    // El ataque real: tomar un pase válido y cambiarle el origen por otro.
    const [, firma] = emitirPase(AGENCIA, SECRETO, AHORA).split('.');
    const datos = Buffer.from(
      JSON.stringify({ origen: 'https://ajeno.com', iat: 0, exp: 9_999_999_999, nonce: 'x' }),
    ).toString('base64url');
    expect(verificarPase(`${datos}.${firma}`, SECRETO, AHORA).valido).toBe(false);
  });

  it('rechaza un pase firmado con otro secreto', () => {
    const ajeno = emitirPase(AGENCIA, 'otro-secreto', AHORA);
    expect(verificarPase(ajeno, SECRETO, AHORA)).toEqual({ valido: false, motivo: 'firma inválida' });
  });

  it('rechaza lo que no tiene forma de pase', () => {
    expect(verificarPase('', SECRETO, AHORA).valido).toBe(false);
    expect(verificarPase('a.b.c', SECRETO, AHORA).valido).toBe(false);
    expect(verificarPase('sin-punto', SECRETO, AHORA).valido).toBe(false);
  });

  it('dos pases del mismo segundo no son iguales', () => {
    expect(emitirPase(AGENCIA, SECRETO, AHORA)).not.toBe(emitirPase(AGENCIA, SECRETO, AHORA));
  });
});

describe('a quién se le sirve el HTML', () => {
  it('a un iframe de una agencia habilitada, con su origen', () => {
    enProduccion();
    expect(
      evaluarDocumento({ destino: 'iframe', referer: `${AGENCIA}/seguros/auto`, host: 'infinito.cebrokers.com.ar' }),
    ).toEqual({ permitido: true, origen: AGENCIA });
  });

  it('no a un iframe de un sitio que no está en la lista', () => {
    enProduccion();
    expect(
      evaluarDocumento({ destino: 'iframe', referer: 'https://ajeno.com/', host: 'infinito.cebrokers.com.ar' }),
    ).toEqual({ permitido: false, motivo: 'origen no habilitado: https://ajeno.com' });
  });

  it('no a un iframe sin Referer: la agencia manda `no-referrer`', () => {
    enProduccion();
    expect(evaluarDocumento({ destino: 'iframe', referer: undefined, host: undefined })).toEqual({
      permitido: false,
      motivo: 'sin referer',
    });
  });

  it('no a quien abre la URL directo en una pestaña', () => {
    enProduccion();
    const veredicto = evaluarDocumento({ destino: 'document', referer: undefined, host: 'infinito.cebrokers.com.ar' });
    expect(veredicto.permitido).toBe(false);
  });

  it('sin Sec-Fetch-Dest —Safari anterior a 16.4— decide el Referer', () => {
    enProduccion();
    expect(evaluarDocumento({ destino: undefined, referer: `${AGENCIA}/`, host: undefined })).toEqual({
      permitido: true,
      origen: AGENCIA,
    });
    // Abrir la URL directo con ese Safari sigue bloqueado: no hay Referer.
    expect(evaluarDocumento({ destino: undefined, referer: undefined, host: undefined }).permitido).toBe(false);
  });

  it('en desarrollo deja abrir el front compilado directo desde localhost', () => {
    process.env['NODE_ENV'] = 'development';
    expect(evaluarDocumento({ destino: 'document', referer: undefined, host: 'localhost:5181' })).toEqual({
      permitido: true,
      origen: 'http://localhost:5181',
    });
  });

  it('en producción, localhost no tiene nada de especial', () => {
    enProduccion();
    expect(evaluarDocumento({ destino: 'document', referer: undefined, host: 'localhost:5181' }).permitido).toBe(
      false,
    );
  });
});

describe('quién puede usar la API', () => {
  it('con un pase válido, sabe de qué agencia viene', () => {
    enProduccion();
    const token = emitirPase(AGENCIA, SECRETO, AHORA);
    expect(autorizarApi(`Pase ${token}`, SECRETO, AHORA)).toEqual({ autorizado: true, origen: AGENCIA });
  });

  it('sin pase, o con otro esquema de autorización, no', () => {
    enProduccion();
    expect(autorizarApi(undefined, SECRETO, AHORA)).toEqual({ autorizado: false, motivo: 'sin pase' });
    expect(autorizarApi('Bearer algo', SECRETO, AHORA)).toEqual({ autorizado: false, motivo: 'sin pase' });
  });

  it('con un pase vencido, no', () => {
    enProduccion();
    const token = emitirPase(AGENCIA, SECRETO, AHORA);
    expect(autorizarApi(`Pase ${token}`, SECRETO, AHORA + DURACION_PASE_MS)).toEqual({
      autorizado: false,
      motivo: 'vencido',
    });
  });

  it('sacar una agencia de la lista corta los pases que ya tenía', () => {
    enProduccion();
    const token = emitirPase(AGENCIA, SECRETO, AHORA);
    process.env['SITIOS_EMBEBIBLES'] = 'https://agencia-dos.com.ar';
    expect(autorizarApi(`Pase ${token}`, SECRETO, AHORA)).toEqual({
      autorizado: false,
      motivo: `origen no habilitado: ${AGENCIA}`,
    });
  });

  it('lee el pase de la cabecera sin importar mayúsculas ni espacios', () => {
    expect(paseDeCabecera('Pase abc.def')).toBe('abc.def');
    expect(paseDeCabecera('  pase   abc.def ')).toBe('abc.def');
    expect(paseDeCabecera('Pase')).toBeUndefined();
  });
});

describe('una cotización es de la agencia que la creó', () => {
  const cotizacion = (origen: string): Cotizacion =>
    ({
      origen,
      creada: Date.now(),
      usada: Date.now(),
      solicitud: 'pendiente',
      valores: {},
      cotizando: false,
      visitados: [],
    }) as unknown as Cotizacion;

  it('se opera con un pase del mismo origen', () => {
    const almacen = new Cotizaciones();
    almacen.guardar('c1', cotizacion(AGENCIA));
    expect(almacen.buscar('c1', AGENCIA).origen).toBe(AGENCIA);
  });

  it('con un pase de otra agencia es un 403, aunque el id sea el correcto', () => {
    const almacen = new Cotizaciones();
    almacen.guardar('c1', cotizacion(AGENCIA));
    const intento = () => almacen.buscar('c1', 'https://agencia-dos.com.ar');
    expect(intento).toThrow(ErrorHttp);
    expect(intento).toThrow('la cotización no pertenece a este sitio');
    try {
      intento();
    } catch (error) {
      expect((error as ErrorHttp).status).toBe(403);
    }
  });

  it('una que no existe es un 400', () => {
    try {
      new Cotizaciones().buscar('nada', AGENCIA);
      expect.unreachable();
    } catch (error) {
      expect((error as ErrorHttp).status).toBe(400);
    }
  });
});

describe('configuración', () => {
  it('en producción no arranca sin secreto, ni con uno corto', () => {
    expect(problemaDeConfiguracion({ NODE_ENV: 'production' })).toMatch(/PASE_SECRETO no está definida/);
    expect(problemaDeConfiguracion({ NODE_ENV: 'production', PASE_SECRETO: 'corto' })).toMatch(/al menos 32/);
    expect(problemaDeConfiguracion({ NODE_ENV: 'production', PASE_SECRETO: SECRETO })).toBeUndefined();
  });

  it('en desarrollo arranca sin secreto, con el de desarrollo', () => {
    expect(problemaDeConfiguracion({ NODE_ENV: 'development' })).toBeUndefined();
    expect(secretoDelPase({})).toMatch(/desarrollo/);
    expect(secretoDelPase({ PASE_SECRETO: SECRETO })).toBe(SECRETO);
  });
});

describe('el HTML y los estáticos', () => {
  it('el pase queda en un meta dentro del head', () => {
    const html = inyectarPase('<html><head><title>x</title></head><body></body></html>', 'abc.def');
    expect(html).toMatch(/<meta name="pase" content="abc\.def" \/>\s*<\/head>/);
  });

  it('no inyecta algo que pueda romper el atributo', () => {
    expect(() => inyectarPase('<head></head>', 'a"><script>')).toThrow();
  });

  // El build vive adentro de un directorio propio: el test de traversal escribe
  // un archivo al lado, y no tiene que ir a parar a la carpeta temporal del sistema.
  const build = () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'infinito-')), 'dist');
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
    writeFileSync(join(dir, 'favicon.ico'), 'ico');
    return dir;
  };

  it('sirve un archivo del build con su tipo', async () => {
    const archivo = await leerEstatico(build(), '/assets/index-abc123.js');
    expect(archivo?.tipo).toBe('text/javascript; charset=utf-8');
    expect(archivo?.cache).toMatch(/immutable/);
  });

  it('no deja salir del directorio del build', async () => {
    const dir = build();
    writeFileSync(join(dir, '..', 'secreto.env'), 'PASE_SECRETO=x');
    expect(await leerEstatico(dir, '/../secreto.env')).toBeUndefined();
    expect(await leerEstatico(dir, '/%2e%2e/secreto.env')).toBeUndefined();
    expect(await leerEstatico(dir, '/assets/%00')).toBeUndefined();
  });

  it('cachea un año lo que tiene hash y una hora lo demás', () => {
    expect(cacheDe('/assets/index-abc123.js')).toMatch(/max-age=31536000/);
    expect(cacheDe('/favicon.ico')).toBe('public, max-age=3600');
  });
});
