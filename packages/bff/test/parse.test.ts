import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStep } from '../src/motor/parse.js';
import { MotorParseError } from '../src/motor/types.js';

/**
 * Los fixtures son respuestas reales del motor, capturadas el 11/09/2026.
 * Cuando el motor cambie, estos tests son la alarma: se recaptura el fixture,
 * se ve el diff y se ajusta parse.ts. Es el precio de no tener API JSON.
 */
const UUID = '994b4085-999d-4301-9531-607ff61fca42';
const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

/** Los pasos que el usuario completa; descarta la pantalla de espera. */
function pasoConFormulario(html: string, stepId?: string) {
  const { session, step } = parseStep(html, UUID, stepId);
  if (step.kind === 'waiting' || step.kind === 'info') {
    throw new Error(`se esperaba un paso con formulario, vino "${step.kind}"`);
  }
  return { session, step };
}

describe('step 1 · patente', () => {
  const { session, step } = pasoConFormulario(fixture('step-1-patente.html'), '1');

  it('reconstruye la sesión', () => {
    expect(session.uuid).toBe(UUID);
    expect(session.s).toMatch(/^[a-z0-9]{20,}$/);
    expect(session.csrf).toHaveLength(64);
  });

  it('lo lee como paso de texto', () => {
    expect(step.kind).toBe('text-input');
    expect(step.title).toBe('¿Cuál es la patente de tu auto?');
    expect(step.eyebrow).toBe('COMENCEMOS');
    expect(step.description).toContain('Con la patente podremos encontrar');
  });

  it('extrae el campo con sus restricciones', () => {
    if (step.kind !== 'text-input') throw new Error('se esperaba text-input');
    expect(step.fields).toEqual([
      {
        name: 'plate',
        type: 'text',
        label: 'Patente',
        placeholder: 'Ej.: AZ456CD',
        maxLength: 7,
      },
    ]);
  });

  it('el submit postea la patente y lleva a 2cp', () => {
    expect(step.submit).toEqual({
      label: 'Cotizar con patente',
      method: 'POST',
      step: '1',
      next: '2cp',
    });
  });

  it('ofrece cotizar sin patente como salida alternativa', () => {
    expect(step.actions).toEqual([
      { label: 'Cotizar sin patente →', method: 'GET', step: '2sp' },
    ]);
  });
});

describe('step 2sp · marcas', () => {
  const { session, step } = pasoConFormulario(fixture('step-2sp-marcas.html'), '2sp');

  it('trae un CSRF distinto al del paso anterior', () => {
    // El CSRF rota por respuesta: reusarlo hace que el motor rechace el POST.
    const anterior = pasoConFormulario(fixture('step-1-patente.html'), '1');
    expect(session.csrf).not.toBe(anterior.session.csrf);
  });

  it('lo lee como paso de selección', () => {
    expect(step.kind).toBe('choice');
    expect(step.title).toBe('¿Cuál es la marca?');
    expect(step.eyebrow).toBe('Contanos de tu auto');
  });

  it('extrae las marcas con su logo', () => {
    if (step.kind !== 'choice') throw new Error('se esperaba choice');
    expect(step.name).toBe('brand');
    expect(step.options).toHaveLength(10);
    expect(step.options.map((o) => o.value)).toEqual([
      'ford', 'chevrolet', 'volkswagen', 'toyota', 'citroen',
      'fiat', 'renault', 'peugeot', 'nissan', 'honda',
    ]);
    for (const option of step.options) {
      expect(option.iconUrl, `${option.value} sin logo`).toBeTruthy();
    }
  });

  it('avanza al elegir una marca, sin botón', () => {
    // El motor postea on-change: no hay botón de submit en los pasos de lista.
    expect(step.submit).toEqual({ method: 'POST', step: '2sp', next: '4sp' });
    expect(step.submit.label).toBeUndefined();
  });

  it('trata «Otra marca» como salida, no como submit', () => {
    // Es un <a href="?step=3sp"> con clase de botón primario: si se lo confunde
    // con el submit, el front postea al paso equivocado.
    expect(step.actions).toEqual([
      { label: 'Otra marca', method: 'GET', step: '3sp' },
    ]);
  });
});

describe('cuando el markup cambia', () => {
  it('falla con contexto en vez de devolver datos incompletos', () => {
    const roto = fixture('step-1-patente.html').replace(/class="title"/g, 'class="titulo"');

    expect(() => parseStep(roto, UUID, '1')).toThrowError(MotorParseError);
    expect(() => parseStep(roto, UUID, '1')).toThrowError(/step=1/);
    expect(() => parseStep(roto, UUID, '1')).toThrowError(/h1\.title/);
  });

  it('no inventa una sesión si falta el CSRF', () => {
    const roto = fixture('step-1-patente.html').replace(/name="csrfmiddlewaretoken"/g, 'name="x"');
    expect(() => parseStep(roto, UUID, '1')).toThrowError(/CSRF/);
  });
});

describe('títulos partidos con <br>', () => {
  it('no pega las palabras', () => {
    // El motor escribe «¿Cuál es tu fecha<br/>de nacimiento?»: sin tratar el
    // <br>, el título llega como «fechade nacimiento».
    const html = `
      <section>
        <h1 class="title">¿Cuál es tu fecha<br/>de nacimiento?</h1>
        <form hx-post="/embed/partial/x?s=abc&step=2_3">
          <input type="hidden" name="csrfmiddlewaretoken" value="${'c'.repeat(64)}">
          <input type="date" name="birth_date" aria-label="Fecha de nacimiento">
          <button class="primary-button">Siguiente</button>
        </form>
      </section>`;
    const { step } = parseStep(html, UUID, '2_3');
    expect(step.title).toBe('¿Cuál es tu fecha de nacimiento?');
  });
});
