import { describe, expect, it } from 'vitest';
import { limitesAdjuntos, tipoPorContenido, validarAdjuntos } from '../src/adjuntos.js';
import { ErrorHttp } from '../src/errores.js';

/**
 * Lo que llega a emisiones como «foto» tiene que ser una foto. Estos casos son
 * los disfraces obvios: un ejecutable renombrado, un HTML con tipo de imagen.
 */

const base64 = (...partes: (readonly number[] | string)[]) =>
  Buffer.concat(partes.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p)))).toString(
    'base64',
  );

const JPEG = base64([0xff, 0xd8, 0xff, 0xe0], 'resto de un jpeg');
const PNG = base64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'resto de un png');
const WEBP = base64('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 ');
const PDF = base64('%PDF-1.7\n', 'resto de un pdf');
const EXE = base64('MZ', [0x90, 0x00, 0x03], 'This program cannot be run in DOS mode');
const HTML = base64('<!doctype html><script>alert(1)</script>');

const LIMITES = { cantidad: 12, bytesPorAdjunto: 5 * 1024 * 1024 };

const statusDe = (hacer: () => unknown): number | undefined => {
  try {
    hacer();
  } catch (error) {
    return error instanceof ErrorHttp ? error.status : -1;
  }
  return undefined;
};

describe('el tipo sale del contenido', () => {
  it('reconoce los cuatro formatos aceptados', () => {
    expect(tipoPorContenido(Buffer.from(JPEG, 'base64'))?.mime).toBe('image/jpeg');
    expect(tipoPorContenido(Buffer.from(PNG, 'base64'))?.mime).toBe('image/png');
    expect(tipoPorContenido(Buffer.from(WEBP, 'base64'))?.mime).toBe('image/webp');
    expect(tipoPorContenido(Buffer.from(PDF, 'base64'))?.mime).toBe('application/pdf');
  });

  it('no reconoce nada más, ni un archivo cortado', () => {
    expect(tipoPorContenido(Buffer.from(EXE, 'base64'))).toBeUndefined();
    expect(tipoPorContenido(Buffer.from(HTML, 'base64'))).toBeUndefined();
    expect(tipoPorContenido(Buffer.from([0xff, 0xd8]))).toBeUndefined();
    expect(tipoPorContenido(Buffer.alloc(0))).toBeUndefined();
  });
});

describe('validación de los adjuntos', () => {
  it('el nombre y el tipo los pone el servidor', () => {
    const [frente, cedula] = validarAdjuntos(
      [
        // `nombre` y `tipo` del cliente se ignoran por completo.
        { clave: 'FRENTE', contenido: PNG, nombre: 'factura.exe', tipo: 'application/x-msdownload' },
        { clave: 'CEDULA_VERDE', contenido: PDF },
      ],
      LIMITES,
    );
    expect(frente).toMatchObject({ nombre: 'foto-frente.png', tipo: 'image/png' });
    expect(cedula).toMatchObject({ nombre: 'cedula.pdf', tipo: 'application/pdf' });
  });

  it('rechaza un .exe renombrado como .jpg', () => {
    expect(() =>
      validarAdjuntos([{ clave: 'FRENTE', contenido: EXE, nombre: 'foto.jpg', tipo: 'image/jpeg' }], LIMITES),
    ).toThrow('no es una imagen JPEG, PNG o WEBP ni un PDF');
  });

  it('rechaza un HTML que dice ser image/png', () => {
    expect(statusDe(() => validarAdjuntos([{ clave: 'TECHO', contenido: HTML, tipo: 'image/png' }], LIMITES))).toBe(
      400,
    );
  });

  it('rechaza más adjuntos que el máximo', () => {
    const muchos = Array.from({ length: 13 }, () => ({ clave: 'FRENTE', contenido: JPEG }));
    expect(() => validarAdjuntos(muchos, LIMITES)).toThrow('demasiados adjuntos: el máximo es 12');
  });

  it('rechaza un adjunto más grande que el tope, con 413', () => {
    const grande = base64([0xff, 0xd8, 0xff], 'x'.repeat(2048));
    expect(statusDe(() => validarAdjuntos([{ clave: 'FRENTE', contenido: grande }], { cantidad: 12, bytesPorAdjunto: 1024 }))).toBe(413);
  });

  it('rechaza una clave que no es una toma, o una repetida', () => {
    expect(() => validarAdjuntos([{ clave: '../../etc/passwd', contenido: JPEG }], LIMITES)).toThrow(
      'adjunto desconocido',
    );
    expect(() =>
      validarAdjuntos(
        [
          { clave: 'FRENTE', contenido: JPEG },
          { clave: 'FRENTE', contenido: JPEG },
        ],
        LIMITES,
      ),
    ).toThrow('adjunto repetido: FRENTE');
  });

  it('rechaza lo que no tiene forma de lista de adjuntos', () => {
    expect(() => validarAdjuntos('no', LIMITES)).toThrow('tiene que ser una lista');
    expect(() => validarAdjuntos([{ clave: 'FRENTE' }], LIMITES)).toThrow('está vacío');
    expect(validarAdjuntos(undefined, LIMITES)).toEqual([]);
  });
});

describe('límites configurables', () => {
  it('toma los de las variables, y los defaults si no se entienden', () => {
    expect(limitesAdjuntos({})).toEqual({ cantidad: 12, bytesPorAdjunto: 5 * 1024 * 1024 });
    expect(limitesAdjuntos({ LIMITE_ADJUNTOS: '10', LIMITE_ADJUNTO_MB: '2' })).toEqual({
      cantidad: 10,
      bytesPorAdjunto: 2 * 1024 * 1024,
    });
    expect(limitesAdjuntos({ LIMITE_ADJUNTOS: 'muchos', LIMITE_ADJUNTO_MB: '-1' })).toEqual(limitesAdjuntos({}));
  });
});
