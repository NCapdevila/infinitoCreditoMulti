import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOptionList, parseStep } from '../src/motor/parse.js';

/**
 * Los pasos con buscador llegan sin opciones: el motor las sirve desde un
 * endpoint aparte que el propio fragmento declara.
 */
const UUID = '994b4085-999d-4301-9531-607ff61fca42';
const MOTOR = 'https://infinito.foxia.ar';
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

/** Los pasos que el usuario completa; descarta la pantalla de espera. */
function pasoConFormulario(html: string, stepId?: string) {
  const { session, step } = parseStep(html, UUID, stepId, MOTOR);
  if (step.kind === 'waiting' || step.kind === 'info') {
    throw new Error(`se esperaba un paso con formulario, vino "${step.kind}"`);
  }
  return { session, step };
}

describe('paso con buscador', () => {
  const { step } = pasoConFormulario(fixture('step-6sp-modelo.html'), '6sp');

  it('lo lee como selección, aunque venga vacío', () => {
    expect(step.kind).toBe('choice');
    expect(step.title).toBe('¿Qué modelo es?');
  });

  it('declara de dónde pedir la lista', () => {
    if (step.kind !== 'choice') throw new Error('se esperaba choice');
    expect(step.options).toHaveLength(0);
    expect(step.optionsSource).toEqual({ path: '/embed/models' });
    expect(step.searchable).toBe(true);
  });

  it('sabe qué campo postear, aunque el input se llame «search»', () => {
    if (step.kind !== 'choice') throw new Error('se esperaba choice');
    expect(step.name).toBe('model');
  });

  it('el submit apunta al paso siguiente del motor', () => {
    expect(step.submit.step).toBe('6sp');
  });
});

describe('listados de catálogo', () => {
  it('lee los modelos', () => {
    const opciones = parseOptionList(fixture('catalogo-modelos.html'));
    expect(opciones.map((o) => o.label)).toContain('AMAROK');
    // El valor viaja compuesto: el motor espera recibirlo tal cual.
    expect(opciones.find((o) => o.label === 'AMAROK')?.value).toBe('AMAROK|39');
  });

  it('lee las provincias', () => {
    const opciones = parseOptionList(fixture('catalogo-provincias.html'));
    expect(opciones).toHaveLength(25);
    expect(opciones[0]).toEqual({ value: 'Capital Federal|1', label: 'Capital Federal' });
  });

  it('no rompe con un listado vacío', () => {
    // El motor devuelve la sección sin filas cuando la búsqueda no matchea.
    expect(parseOptionList('<div id="model-list" class="locations-section"></div>')).toEqual([]);
  });
});

describe('recursos del motor', () => {
  it('devuelve los logos como URL absoluta', () => {
    // Los logos llegan como «/static/assets/…», relativos al motor. Sin
    // absolutizarlos, el navegador los busca en el origen de la app y las
    // marcas se ven sin logo.
    const { step } = pasoConFormulario(fixture('step-2sp-marcas.html'), '2sp');
    if (step.kind !== 'choice') throw new Error('se esperaba choice');

    for (const opcion of step.options) {
      expect(opcion.iconUrl, `${opcion.value} sin logo`).toBeDefined();
      expect(opcion.iconUrl, `${opcion.value} con URL relativa`).not.toMatch(/^\//);
    }
  });
});
