import { describe, expect, it } from 'vitest';
import {
  Cotizaciones,
  TTL_CON_PLAN_MS,
  TTL_COTIZANDO_MS,
  type Cotizacion,
  type PlanElegido,
} from '../src/cotizaciones.js';
import {
  asuntoDeSolicitud,
  contactoDelCliente,
  datosDeEmision,
  planDeResultados,
  seccionesDeSolicitud,
  vehiculoDeValores,
} from '../src/emision.js';
import { ErrorHttp } from '../src/errores.js';
import type { Quotations } from '../src/motor/quotations.js';

/**
 * Una constancia o una solicitud sólo salen de una cotización real, y con lo
 * que cotizó el motor, no con lo que diga el pedido.
 */

const AGENCIA = 'https://www.agencia-uno.com.ar';
const T0 = Date.UTC(2026, 8, 16, 12, 0, 0);

const PLAN: PlanElegido = {
  code: '21',
  compania: 'Zurich',
  plan: 'RESPONSABILIDAD CIVIL',
  costoMensual: '$38.000',
  sumaAsegurada: '$8.500.000',
};

const nueva = (extra: Partial<Cotizacion> = {}): Cotizacion =>
  ({
    valores: {},
    cotizando: true,
    visitados: [],
    origen: AGENCIA,
    creada: T0,
    usada: T0,
    solicitud: 'pendiente',
    ...extra,
  }) as unknown as Cotizacion;

/** El `status` de lo que tiró `hacer`, o `undefined` si no tiró. */
const statusDe = (hacer: () => unknown): number | undefined => {
  try {
    hacer();
  } catch (error) {
    return error instanceof ErrorHttp ? error.status : -1;
  }
  return undefined;
};

describe('qué cotización puede emitir', () => {
  it('sin `cotizacionId` no hay constancia', () => {
    const almacen = new Cotizaciones();
    expect(() => almacen.paraEmitir(undefined, AGENCIA, T0)).toThrow('falta `cotizacionId`');
    expect(statusDe(() => almacen.paraEmitir('', AGENCIA, T0))).toBe(400);
  });

  it('sin plan elegido, tampoco: cotizar no alcanza', () => {
    const almacen = new Cotizaciones();
    almacen.guardar('c1', nueva());
    expect(() => almacen.paraEmitir('c1', AGENCIA, T0)).toThrow('la cotización no tiene un plan elegido');
  });

  it('con plan elegido, sí', () => {
    const almacen = new Cotizaciones();
    almacen.guardar('c1', nueva({ plan: PLAN }));
    expect(almacen.paraEmitir('c1', AGENCIA, T0).plan).toEqual(PLAN);
  });

  it('con un pase de otra agencia es un 403', () => {
    const almacen = new Cotizaciones();
    almacen.guardar('c1', nueva({ plan: PLAN }));
    expect(statusDe(() => almacen.paraEmitir('c1', 'https://agencia-dos.com.ar', T0))).toBe(403);
  });
});

describe('vencimiento', () => {
  it('cotizando, vence a la media hora sin usarse', () => {
    const almacen = new Cotizaciones();
    almacen.guardar('c1', nueva());
    expect(() => almacen.buscar('c1', AGENCIA, T0 + TTL_COTIZANDO_MS)).toThrow('no existe o expiró');
  });

  it('con plan elegido aguanta dos horas: lo que sigue es cargar la contratación y las fotos', () => {
    const almacen = new Cotizaciones();
    almacen.guardar('c1', nueva({ plan: PLAN }));
    expect(almacen.buscar('c1', AGENCIA, T0 + TTL_COTIZANDO_MS + 1).plan).toEqual(PLAN);
    expect(() => almacen.paraEmitir('c1', AGENCIA, T0 + TTL_COTIZANDO_MS + 1 + TTL_CON_PLAN_MS)).toThrow(
      'no existe o expiró',
    );
  });

  it('se cuenta desde el último uso, no desde que se creó', () => {
    const almacen = new Cotizaciones();
    almacen.guardar('c1', nueva());
    const casiVencida = T0 + TTL_COTIZANDO_MS - 1000;
    almacen.buscar('c1', AGENCIA, casiVencida);
    // Media hora después de crearla sigue viva, porque se usó hace un segundo.
    expect(almacen.buscar('c1', AGENCIA, T0 + TTL_COTIZANDO_MS).origen).toBe(AGENCIA);
  });

  it('la limpieza saca las vencidas y deja las vigentes', () => {
    const almacen = new Cotizaciones();
    almacen.guardar('vieja', nueva());
    almacen.guardar('con-plan', nueva({ plan: PLAN }));
    almacen.limpiar(T0 + TTL_COTIZANDO_MS);
    expect(() => almacen.buscar('vieja', AGENCIA, T0)).toThrow('no existe o expiró');
    expect(almacen.buscar('con-plan', AGENCIA, T0).plan).toEqual(PLAN);
  });
});

describe('una sola solicitud por cotización', () => {
  it('la segunda es un 409', () => {
    const almacen = new Cotizaciones();
    const c = nueva({ plan: PLAN });
    almacen.reservarSolicitud(c);
    almacen.confirmarSolicitud(c);
    expect(statusDe(() => almacen.reservarSolicitud(c))).toBe(409);
  });

  it('también mientras la primera se está enviando: dos clics no mandan dos correos', () => {
    const almacen = new Cotizaciones();
    const c = nueva({ plan: PLAN });
    almacen.reservarSolicitud(c);
    expect(() => almacen.reservarSolicitud(c)).toThrow('ya se está enviando');
  });

  it('si el envío falló, se puede reintentar', () => {
    const almacen = new Cotizaciones();
    const c = nueva({ plan: PLAN });
    almacen.reservarSolicitud(c);
    almacen.liberarSolicitud(c);
    expect(statusDe(() => almacen.reservarSolicitud(c))).toBeUndefined();
  });

  it('liberar no deshace una que ya salió', () => {
    const almacen = new Cotizaciones();
    const c = nueva({ plan: PLAN });
    almacen.reservarSolicitud(c);
    almacen.confirmarSolicitud(c);
    almacen.liberarSolicitud(c);
    expect(c.solicitud).toBe('enviada');
  });
});

describe('los datos de la constancia', () => {
  const formulario = {
    cotizacionId: 'c1',
    asegurado: { nombre: 'PRUEBA', documento: '12345678', tipoDocumento: 'DNI', domicilio: 'Calle 1 (1431)' },
    // Lo que alguien cambiaría para falsificar una constancia:
    poliza: { aseguradora: 'Aseguradora Trucha S.A.', fechaCarga: '2020-01-01T00:00:00Z' },
    cobertura: { codigo: '99', detalle: 'TODO RIESGO SIN FRANQUICIA', sumaAsegurada: '$ 999.999.999' },
    vehiculo: {
      descripcion: 'CLIO 1.6',
      marca: 'FERRARI',
      modelo: 'F40',
      anio: 1990,
      patente: 'AAA000',
      motor: 'M1',
      chasis: 'C1',
    },
  };

  it('ignora la aseguradora y la cobertura del pedido: salen del plan guardado', () => {
    const datos = datosDeEmision(formulario, { valores: {}, plan: PLAN });
    expect(datos.poliza.aseguradora).toBe('Zurich');
    expect(datos.cobertura).toEqual({ codigo: '21', detalle: 'RESPONSABILIDAD CIVIL', sumaAsegurada: '$8.500.000' });
  });

  it('la fecha es la del servidor', () => {
    const ahora = new Date(T0);
    expect(datosDeEmision(formulario, { valores: {}, plan: PLAN }, ahora).poliza.fechaCarga).toBe(ahora);
  });

  it('el vehículo que cotizó el motor manda sobre el del formulario', () => {
    const valores = { brand: 'renault', model: 'CLIO|39', year: '2014', plate: 'nzb218' };
    const { vehiculo } = datosDeEmision(formulario, { valores, plan: PLAN });
    expect(vehiculo).toMatchObject({ marca: 'RENAULT', modelo: 'CLIO', anio: 2014, patente: 'NZB218' });
    // Lo que el motor no conoce sigue viniendo del formulario.
    expect(vehiculo).toMatchObject({ descripcion: 'CLIO 1.6', motor: 'M1', chasis: 'C1' });
  });

  it('lo que el motor no trae, sale del formulario', () => {
    const { vehiculo } = datosDeEmision(formulario, { valores: { plate: 'AB123CD' }, plan: PLAN });
    expect(vehiculo).toMatchObject({ marca: 'FERRARI', modelo: 'F40', anio: 1990, patente: 'AB123CD' });
  });

  /**
   * Cotizando con patente no hay pasos de marca, modelo, año ni versión: el
   * motor resuelve el auto y lo dice una sola vez. Antes de guardarlo, la
   * constancia salía con la patente correcta al lado del auto que hubiera
   * quedado en el formulario.
   */
  it('con patente, el auto lo pone el motor aunque no haya pasado por los pasos', () => {
    const { vehiculo } = datosDeEmision(formulario, {
      valores: { plate: 'ded189' },
      vehiculo: { marca: 'FIAT', descripcion: 'PALIO S 1.3 MPI (3 P)', anio: 2000 },
      plan: PLAN,
    });
    expect(vehiculo).toMatchObject({
      marca: 'FIAT',
      // El motor manda un solo texto: modelo y versión llevan el mismo.
      modelo: 'PALIO S 1.3 MPI (3 P)',
      descripcion: 'PALIO S 1.3 MPI (3 P)',
      anio: 2000,
      patente: 'DED189',
    });
    // Motor y chasis no los consulta el motor: esos sí son del formulario.
    expect(vehiculo).toMatchObject({ motor: 'M1', chasis: 'C1' });
  });

  it('una patente con caracteres raros no sale al asunto ni al nombre del PDF', () => {
    const conTrampa = { ...formulario, vehiculo: { ...formulario.vehiculo, patente: 'AB1\r\nBcc: x@y"' } };
    expect(datosDeEmision(conTrampa, { valores: {}, plan: PLAN }).vehiculo.patente).toBe('AB1 BCC XY');
  });

  it('sin nombre del asegurado no se arma', () => {
    expect(() => datosDeEmision({ asegurado: {} }, { valores: {}, plan: PLAN })).toThrow(
      'faltan datos para armar la constancia',
    );
  });
});

describe('el plan elegido', () => {
  const resultados = {
    total: 2,
    awaitingFirstResults: false,
    groups: [
      {
        id: 'rc',
        name: 'Responsabilidad Civil',
        declaredCount: 2,
        awaitingResults: false,
        quotes: [
          { code: '21', company: 'Zurich', plan: 'RESPONSABILIDAD CIVIL', price: { cents: 3800000, formatted: '$38.000' }, insuredAmount: { cents: 850000000, formatted: '$8.500.000' }, features: [] },
          { code: '01', company: 'Meridional', plan: 'RC', price: { cents: 4000000, formatted: '$40.000' }, features: [] },
        ],
      },
    ],
  } as unknown as Quotations;

  it('se toma de los resultados del motor', () => {
    expect(planDeResultados(resultados, { code: '21', insurance: 'Zurich', plan: 'RESPONSABILIDAD CIVIL' })).toEqual(PLAN);
  });

  it('un plan que no está entre los resultados no existe', () => {
    expect(planDeResultados(resultados, { code: '21', insurance: 'Zurich', plan: 'TODO RIESGO' })).toBeUndefined();
    // «01» y «1» son códigos distintos: Meridional y Sancor.
    expect(planDeResultados(resultados, { code: '1', insurance: 'Meridional', plan: 'RC' })).toBeUndefined();
  });
});

describe('el correo', () => {
  const ASUNTO = {
    agencia: 'Concesionaria del Litoral',
    compania: PLAN.compania,
    patente: 'NZB218',
    cliente: 'JUAN PÉREZ',
  };

  it('el asunto lo arma el servidor', () => {
    expect(asuntoDeSolicitud(ASUNTO)).toBe(
      'Solicitud de Emisión - Concesionaria del Litoral - Zurich - NZB218 - JUAN PÉREZ',
    );
  });

  it('una parte vacía se omite en vez de dejar el hueco entre guiones', () => {
    expect(asuntoDeSolicitud({ ...ASUNTO, agencia: '' })).toBe(
      'Solicitud de Emisión - Zurich - NZB218 - JUAN PÉREZ',
    );
    // La patente es la excepción: que falte dice algo y conviene leerlo.
    expect(asuntoDeSolicitud({ ...ASUNTO, patente: '' })).toContain('sin patente');
  });

  it('un salto de línea en el asunto no agrega cabeceras al correo', () => {
    // Sin esto, «\nBcc: …» en el nombre de la agencia manda copia a un tercero.
    const asunto = asuntoDeSolicitud({
      ...ASUNTO,
      agencia: 'Agencia\r\nBcc: ajeno@ejemplo.com',
    });
    expect(asunto).not.toMatch(/[\r\n]/);
    expect(asunto).toContain('Agencia Bcc: ajeno@ejemplo.com');
  });

  it('una agencia que no es texto se descarta, no rompe el asunto', () => {
    expect(asuntoDeSolicitud({ ...ASUNTO, agencia: { nombre: 'X' } })).toBe(
      'Solicitud de Emisión - Zurich - NZB218 - JUAN PÉREZ',
    );
  });

  it('la sección de cobertura sale del plan, y una falsa del cliente se descarta', () => {
    const secciones = seccionesDeSolicitud(
      [
        { titulo: 'Cobertura elegida', filas: [['Compañía', 'Aseguradora Trucha']] },
        { titulo: 'Asegurado', filas: [['Nombre', 'Prueba']] },
        { titulo: 'Rota', filas: 'no es una lista' },
      ],
      PLAN,
    );
    expect(secciones.filter((s) => s.titulo === 'Cobertura elegida')).toHaveLength(1);
    expect(secciones[0]?.filas[0]).toEqual(['Compañía', 'Zurich']);
    expect(secciones[1]).toEqual({ titulo: 'Asegurado', filas: [['Nombre', 'Prueba']] });
  });

  it('acepta un e-mail normal y un nombre', () => {
    expect(contactoDelCliente(' cliente@ejemplo.com.ar ', 'Juan Pérez')).toEqual({
      emailCliente: 'cliente@ejemplo.com.ar',
      nombreCliente: 'Juan Pérez',
    });
  });

  it('sin e-mail no hay correo al cliente, y no es un error', () => {
    expect(contactoDelCliente('', undefined)).toEqual({});
  });

  it('rechaza varios destinatarios, espacios o algo que no es un e-mail', () => {
    for (const malo of ['a@b.com, spam@x.com', 'a@b.com\r\nBcc: x@y.com', 'sin-arroba', 'a@b', `${'a'.repeat(250)}@b.com`]) {
      expect(statusDe(() => contactoDelCliente(malo, 'X')), malo).toBe(400);
    }
  });

  it('rechaza un nombre con saltos de línea o demasiado largo', () => {
    expect(() => contactoDelCliente('a@b.com', 'Juan\nBcc: x')).toThrow('saltos de línea');
    expect(statusDe(() => contactoDelCliente('a@b.com', 'x'.repeat(121)))).toBe(400);
  });
});

describe('vehículo desde los valores del motor', () => {
  it('sólo trae lo que hay', () => {
    expect(vehiculoDeValores({})).toEqual({});
    expect(vehiculoDeValores({ year: 'no-es-un-año' })).toEqual({});
  });
});
