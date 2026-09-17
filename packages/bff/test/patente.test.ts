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

/**
 * El vehículo encontrado, que es el caso normal.
 *
 * El botón que confirma no dice a dónde va: es un `<a href="#">` con
 * `onclick="checkCarAge(<año>)"`, y el destino lo decide un script inline según
 * la antigüedad. Como el límite se cuenta contra el año en curso, los fixtures
 * se reescriben con años relativos a hoy: clavar 2020 hacía un test que
 * empezaba a fallar solo en 2040.
 */
describe('confirmación del vehículo · encontrado', () => {
  const anio = (offset: number) =>
    fixture('step-2cp-vehiculo-ok.html').replace(
      'checkCarAge(2000)',
      `checkCarAge(${new Date().getFullYear() - offset})`,
    );

  const { step } = parseStep(anio(5), UUID, '2cp');

  it('muestra el vehículo que encontró', () => {
    if (step.kind !== 'info') throw new Error('se esperaba info');
    expect(step.detalle[0]).toBe('FIAT PALIO S 1.3 MPI (3 P) 2000');
    expect(step.detalle.join(' ')).toContain('SEDAN 3 PUERTAS');
  });

  it('guarda el auto: es el único lugar donde el motor dice cuál es', () => {
    if (step.kind !== 'info') throw new Error('se esperaba info');
    // Las dos puntas del título salen: tienen campo propio en la constancia y
    // al lado se verían repetidas.
    expect(step.vehiculo).toEqual({
      marca: 'FIAT',
      descripcion: 'PALIO S 1.3 MPI (3 P)',
      anio: 2000,
    });
  });

  it('no inventa un auto cuando la consulta por patente falló', () => {
    // Sin logo de marca no hubo vehículo: la tarjeta trae el error.
    const { step: sinAuto } = parseStep(fixture('step-2cp-vehiculo.html'), UUID, '2cp');
    if (sinAuto.kind !== 'info') throw new Error('se esperaba info');
    expect(sinAuto.vehiculo).toBeUndefined();
  });

  it('ofrece confirmar primero y corregir después', () => {
    if (step.kind !== 'info') throw new Error('se esperaba info');
    // El markup escribe la salida secundaria antes que el botón de confirmar;
    // el orden de la pantalla es el de la pregunta, no el del HTML.
    expect(step.actions.map((a) => a.label)).toEqual([
      'Sí, continuemos',
      'No, necesito modificar los datos',
    ]);
  });

  it('un auto reciente sigue por el camino normal', () => {
    if (step.kind !== 'info') throw new Error('se esperaba info');
    expect(step.actions[0]).toEqual({ label: 'Sí, continuemos', method: 'GET', step: '2_1' });
  });

  it('uno de más de veinte años va a la pantalla que avisa, y por POST', () => {
    const { step: viejo } = parseStep(anio(25), UUID, '2cp');
    if (viejo.kind !== 'info') throw new Error('se esperaba info');
    // Por GET el motor sirve esa misma pantalla sin el año y sin el botón de
    // contacto: el método no es un detalle.
    expect(viejo.actions[0]).toEqual({ label: 'Sí, continuemos', method: 'POST', step: '5sp' });
  });

  it('falla si el botón de confirmar deja de decir a dónde va', () => {
    const roto = anio(5).replace(/htmx\.ajax/g, 'otraCosa');
    expect(() => parseStep(roto, UUID, '2cp')).toThrowError(/confirmar el vehículo/);
  });
});

/**
 * La pantalla de los autos de más de veinte años.
 *
 * Es la única sin salida adentro del motor: no trae formulario, ni htmx, ni un
 * link con la sesión. Lo único que ofrece es hablar con un asesor.
 */
describe('auto anterior al 2006', () => {
  const previa = { uuid: UUID, s: 'sesiondeprueba000000000000000000', csrf: 'csrf-anterior' };
  const { session, step } = parseStep(
    fixture('step-5sp-auto-viejo.html'),
    UUID,
    '5sp',
    undefined,
    previa,
  );

  it('conserva la sesión, que el fragmento no repite', () => {
    // Sin esto, llegar acá era un 502 por «no se encontró el token de sesión».
    expect(session.s).toBe(previa.s);
  });

  it('es una pantalla informativa, no una espera', () => {
    expect(step.kind).toBe('info');
    expect(step.title).toBe('Anterior al año 2006');
    if (step.kind !== 'info') return;
    expect(step.description).toContain('contactate con un asesor');
  });

  it('su única salida es el WhatsApp del asesor, tal como lo manda el motor', () => {
    if (step.kind !== 'info') throw new Error('se esperaba info');
    expect(step.actions).toEqual([]);
    expect(step.contacto?.label).toBe('Contactar por Whatsapp');
    expect(step.contacto?.url).toContain('wa.me/5491167928789');
  });
});
