import { describe, expect, it, vi } from 'vitest';
import {
  configRecaptcha,
  problemaDeConfiguracion,
  scoreMinimo,
  verificarRecaptcha,
  type ConfigRecaptcha,
} from '../src/recaptcha.js';

/**
 * El reCAPTCHA es lo que un script no puede fabricar: estos casos son todas las
 * formas en que un token puede no alcanzar. `fetch` se reemplaza, así los tests
 * no dependen de Google ni de tener claves.
 */

const CONFIG: ConfigRecaptcha = {
  secreto: 'secreto-de-prueba',
  scoreMinimo: 0.5,
  hostnames: ['infinito.cebrokers.com.ar'],
};

const BUENA = {
  success: true,
  score: 0.9,
  action: 'solicitud',
  hostname: 'infinito.cebrokers.com.ar',
};

/** Un `fetch` que contesta lo que Google contestaría. */
const google = (cuerpo: object, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(cuerpo), { status })) as unknown as typeof fetch;

describe('verificación del token', () => {
  it('acepta un token bueno y devuelve el puntaje', async () => {
    const pedir = google(BUENA);
    expect(await verificarRecaptcha('token', 'solicitud', CONFIG, pedir)).toEqual({ valido: true, score: 0.9 });
  });

  it('le manda a Google el secreto y el token, no otra cosa', async () => {
    const pedir = google(BUENA);
    await verificarRecaptcha('el-token', 'solicitud', CONFIG, pedir);
    const [url, init] = (pedir as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://www.google.com/recaptcha/api/siteverify');
    const cuerpo = new URLSearchParams(String(init.body));
    expect(cuerpo.get('secret')).toBe('secreto-de-prueba');
    expect(cuerpo.get('response')).toBe('el-token');
  });

  it('sin token ni se le pregunta a Google', async () => {
    const pedir = google(BUENA);
    expect(await verificarRecaptcha(undefined, 'solicitud', CONFIG, pedir)).toMatchObject({
      valido: false,
      status: 403,
      motivo: 'sin token',
    });
    expect(pedir).not.toHaveBeenCalled();
  });

  it('rechaza si Google dice `success: false`', async () => {
    const pedir = google({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    expect(await verificarRecaptcha('token', 'solicitud', CONFIG, pedir)).toMatchObject({
      valido: false,
      status: 403,
      motivo: 'Google lo rechazó (timeout-or-duplicate)',
    });
  });

  it('rechaza un token de otra acción: uno de `cotizar` no sirve para mandar una solicitud', async () => {
    const pedir = google({ ...BUENA, action: 'cotizar' });
    const resultado = await verificarRecaptcha('token', 'solicitud', CONFIG, pedir);
    expect(resultado).toMatchObject({ valido: false, status: 403 });
    if (!resultado.valido) expect(resultado.motivo).toMatch(/acción equivocada/);
  });

  it('rechaza un token emitido en otro sitio', async () => {
    const pedir = google({ ...BUENA, hostname: 'sitio-ajeno.com' });
    expect(await verificarRecaptcha('token', 'solicitud', CONFIG, pedir)).toMatchObject({
      valido: false,
      status: 403,
      motivo: 'hostname ajeno: sitio-ajeno.com',
    });
  });

  it('rechaza un puntaje bajo y lo informa, para poder ajustar el umbral', async () => {
    const pedir = google({ ...BUENA, score: 0.3 });
    expect(await verificarRecaptcha('token', 'solicitud', CONFIG, pedir)).toEqual({
      valido: false,
      status: 403,
      motivo: 'puntaje bajo: 0.3 < 0.5',
      score: 0.3,
    });
  });

  it('el umbral es inclusivo: justo en el mínimo, pasa', async () => {
    const pedir = google({ ...BUENA, score: 0.5 });
    expect((await verificarRecaptcha('token', 'solicitud', CONFIG, pedir)).valido).toBe(true);
  });

  it('ante un error de red rechaza: no se puede saltear tirando la conexión', async () => {
    const pedir = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(await verificarRecaptcha('token', 'solicitud', CONFIG, pedir)).toMatchObject({
      valido: false,
      status: 503,
      motivo: 'no se pudo verificar: fetch failed',
    });
  });

  it('también rechaza si Google contesta con error o con algo que no es JSON', async () => {
    expect(await verificarRecaptcha('token', 'solicitud', CONFIG, google({}, 500))).toMatchObject({
      valido: false,
      status: 503,
    });
    const roto = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    expect(await verificarRecaptcha('token', 'solicitud', CONFIG, roto)).toMatchObject({
      valido: false,
      status: 503,
    });
  });
});

describe('configuración', () => {
  it('en producción no arranca sin secreto', () => {
    expect(problemaDeConfiguracion({ NODE_ENV: 'production' })).toMatch(/RECAPTCHA_SECRETO/);
    expect(problemaDeConfiguracion({ NODE_ENV: 'production', RECAPTCHA_SECRETO: 'x' })).toBeUndefined();
  });

  it('en desarrollo sin secreto queda desactivado', () => {
    expect(problemaDeConfiguracion({ NODE_ENV: 'development' })).toBeUndefined();
    expect(configRecaptcha({})).toBeUndefined();
  });

  it('en desarrollo acepta además localhost; en producción, sólo el dominio de la app', () => {
    expect(configRecaptcha({ RECAPTCHA_SECRETO: 'x' })?.hostnames).toEqual([
      'infinito.cebrokers.com.ar',
      'localhost',
      '127.0.0.1',
    ]);
    expect(configRecaptcha({ RECAPTCHA_SECRETO: 'x', NODE_ENV: 'production' })?.hostnames).toEqual([
      'infinito.cebrokers.com.ar',
    ]);
  });

  it('un puntaje mínimo que no se entiende cae al default, no a cero', () => {
    expect(scoreMinimo({})).toBe(0.3);
    expect(scoreMinimo({ RECAPTCHA_SCORE_MINIMO: '0.7' })).toBe(0.7);
    expect(scoreMinimo({ RECAPTCHA_SCORE_MINIMO: 'cero coma siete' })).toBe(0.3);
    expect(scoreMinimo({ RECAPTCHA_SCORE_MINIMO: '7' })).toBe(0.3);
  });
});
