import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStep } from '../src/motor/parse.js';

/**
 * Cotizar con patente.
 *
 * El motor decide a dónde ir con el hidden `next` del formulario: sin
 * reenviarlo, re-renderiza el mismo paso y el usuario ve que no pasa nada.
 */
const UUID = '994b4085-999d-4301-9531-607ff61fca42';
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('paso de patente', () => {
  const { step } = parseStep(fixture('step-1-patente.html'), UUID, '1');

  it('declara a dónde lleva la patente', () => {
    // Este valor es el que hay que reenviar en el POST.
    expect(step.kind).toBe('text-input');
    if (step.kind !== 'text-input') return;
    expect(step.submit.next).toBe('2cp');
  });
});

describe('confirmación del vehículo', () => {
  const { step } = parseStep(fixture('step-2cp-vehiculo.html'), UUID, '2cp');

  it('no la confunde con la pantalla de espera', () => {
    // No tiene formulario, pero sí una salida: no es una espera.
    expect(step.kind).toBe('info');
    expect(step.title).toBe('¿Este es tu vehículo?');
  });

  it('trae lo que el motor respondió sobre la patente', () => {
    if (step.kind !== 'info') throw new Error('se esperaba info');
    expect(step.detalle[0]).toBe('Patente: AZ456CD');
    expect(step.detalle.join(' ')).toContain('Error al consultar');
  });

  it('ofrece continuar hacia la búsqueda por marca', () => {
    if (step.kind !== 'info') throw new Error('se esperaba info');
    expect(step.actions).toEqual([{ label: 'Siguiente', method: 'GET', step: '2sp' }]);
  });

  it('no toma el destino de su acción como identidad', () => {
    // Si el id fuera «2sp», este paso y la pantalla de marcas compartirían
    // identidad y el front los trataría como el mismo.
    const { step: sinId } = parseStep(fixture('step-2cp-vehiculo.html'), UUID);
    expect(sinId.id).not.toBe('2sp');
  });
});
