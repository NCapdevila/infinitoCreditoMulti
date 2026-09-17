import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMoney, parseQuotations } from '../src/motor/quotations.js';
import { MotorParseError } from '../src/motor/types.js';

/**
 * Fixtures capturados de un HAR real (11/09/2026): las tres fotos del polling
 * — sin resultados, a medio llegar y completo.
 */
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('resultados completos', () => {
  const r = parseQuotations(fixture('quotations-full.html'));

  it('agrupa por cobertura', () => {
    expect(r.groups.map((g) => g.name)).toEqual([
      'Responsabilidad Civil',
      'Terceros Básico',
      'Terceros Completos',
      'Terceros Completos Premium',
      'Todo Riesgo',
    ]);
  });

  it('trae los 33 planes', () => {
    expect(r.total).toBe(33);
    expect(r.groups.map((g) => g.quotes.length)).toEqual([6, 6, 5, 6, 10]);
  });

  it('el conteo del encabezado coincide con los planes leídos', () => {
    // Si el motor declara 10 y parseamos 9, perdimos una tarjeta en silencio.
    for (const g of r.groups) {
      expect(g.quotes.length, `${g.name} declara ${g.declaredCount}`).toBe(g.declaredCount);
    }
  });

  it('ya no está esperando los primeros resultados', () => {
    expect(r.awaitingFirstResults).toBe(false);
  });

  it('lee una cotización entera', () => {
    const zurich = r.groups[0]?.quotes[0];
    expect(zurich).toMatchObject({
      code: '21',
      company: 'Zurich',
      plan: 'RESPONSABILIDAD CIVIL',
      price: { cents: 8_362_800, formatted: '$83.628' },
      insuredAmount: { cents: 3_731_200_000, formatted: '$37.312.000' },
    });
    expect(zurich?.companyLogoUrl).toContain('Zurich.png');
    expect(zurich?.features).toContain('Responsabilidad Civil hacia Terceros');
  });

  it('cubre las compañías del multi', () => {
    const companies = new Set(r.groups.flatMap((g) => g.quotes.map((q) => q.company)));
    expect(companies).toContain('Mapfre');
    expect(companies).toContain('San Cristóbal');
    expect(companies.size).toBeGreaterThanOrEqual(5);
  });

  it('toda cotización sirve para contratar', () => {
    // code + company + plan es lo que la etapa 3 recibe como elección.
    for (const q of r.groups.flatMap((g) => g.quotes)) {
      expect(q.code, `${q.company} sin code`).not.toBe('');
      expect(q.plan.length, `${q.company} sin plan`).toBeGreaterThan(0);
      expect(q.price.cents, `${q.company} sin precio`).toBeGreaterThan(0);
    }
  });

  it('el code es un string opaco, nunca un número', () => {
    const codes = r.groups.flatMap((g) => g.quotes.map((q) => q.code));

    // San Cristóbal usa códigos alfanuméricos.
    expect(codes).toContain('CA7_CPlus');
    // Meridional usa ceros a la izquierda y Sancor tiene un plan con code "1":
    // convertir a número haría que "01" colisione con otra póliza.
    expect(codes).toContain('01');
    expect(codes).toContain('1');
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('polling', () => {
  it('sin resultados todavía: las cinco coberturas esperan', () => {
    const r = parseQuotations(fixture('quotations-vacio.html'));
    expect(r.total).toBe(0);
    expect(r.groups).toHaveLength(5);
    expect(r.awaitingFirstResults).toBe(true);
    expect(r.groups.every((g) => g.awaitingResults)).toBe(true);
  });

  it('a medio llegar: entrega lo que hay sin fingir que terminó', () => {
    const r = parseQuotations(fixture('quotations-parcial.html'));
    expect(r.total).toBe(5);
    // Con 5 de 33 planes ya no queda un solo spinner: por eso el corte del
    // polling no puede basarse en esta señal.
    expect(r.awaitingFirstResults).toBe(false);
  });

  /**
   * Las dos pantallas sin una sola cobertura, las dos vistas en producción.
   *
   * Fallaban con 502 y el front cortaba el polling ahí mismo: la cotización se
   * moría en la primera vuelta por una foto que dos segundos después ya traía
   * planes.
   */
  it('el acordeón sin coberturas es una foto vacía, no un error', () => {
    const r = parseQuotations(fixture('quotations-sin-coberturas.html'));
    expect(r.total).toBe(0);
    expect(r.groups).toEqual([]);
    expect(r.awaitingFirstResults).toBe(true);
  });

  it('"Procesando cotizaciones…" tampoco es un error', () => {
    const r = parseQuotations(fixture('quotations-procesando.html'));
    expect(r.total).toBe(0);
    expect(r.awaitingFirstResults).toBe(true);
  });
});

describe('importes', () => {
  it('lee el formato argentino', () => {
    expect(parseMoney('$83.628', 'test').cents).toBe(8_362_800);
    expect(parseMoney('$37.312.000', 'test').cents).toBe(3_731_200_000);
    expect(parseMoney('$1.234,56', 'test').cents).toBe(123_456);
  });

  it('no adivina ante un formato desconocido', () => {
    // Interpretar mal el separador daría un precio mil veces mayor.
    expect(() => parseMoney('consultar', 'test')).toThrowError(MotorParseError);
  });
});

describe('cuando el markup cambia', () => {
  it('falla si desaparecen los acordeones', () => {
    // Con las tarjetas a la vista y ningún acordeón, el markup cambió: acá no
    // vale confundirlo con la pantalla que todavía no trajo nada.
    const roto = fixture('quotations-full.html').replaceAll('quotation-coverage-accordion', 'x');
    expect(() => parseQuotations(roto)).toThrowError(/no tiene coberturas/);
  });

  it('falla si el motor devuelve algo que no es la pantalla de resultados', () => {
    expect(() => parseQuotations('<html><body>502 Bad Gateway</body></html>')).toThrowError(
      MotorParseError,
    );
  });

  it('falla si el botón de contratar deja de traer la elección', () => {
    const roto = fixture('quotations-full.html').replaceAll('hx-vals=', 'data-vals=');
    expect(() => parseQuotations(roto)).toThrowError(/botón de contratar/);
  });
});
