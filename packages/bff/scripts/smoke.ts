/**
 * Verificación manual contra el motor real.
 *
 * No es un test: depende de la red y de que el motor esté arriba. Sirve para
 * confirmar que el parseo aguanta respuestas frescas, y para recapturar
 * fixtures cuando el markup cambie.
 *
 *   npx tsx scripts/smoke.ts
 */
import { MotorClient } from '../src/motor/client.js';

const client = new MotorClient({
  baseUrl: 'https://infinito.foxia.ar',
  uuid: '994b4085-999d-4301-9531-607ff61fca42',
});

const inicio = await client.start();
console.log('── paso 1 ──');
console.log(JSON.stringify(inicio.step, null, 2));

const sinPatente = inicio.step.actions.find((a) => a.step === '2sp');
if (sinPatente === undefined) throw new Error('el paso 1 ya no ofrece cotizar sin patente');

const marcas = await client.goTo(sinPatente.step, inicio.session);
console.log(`\n── paso ${marcas.step.id} ──`);
if (marcas.step.kind !== 'choice') throw new Error(`se esperaba choice, vino ${marcas.step.kind}`);
console.log(`${marcas.step.title} · ${marcas.step.options.length} opciones`);
console.log(marcas.step.options.map((o) => o.value).join(', '));
console.log('submit →', JSON.stringify(marcas.step.submit));
console.log('salidas →', JSON.stringify(marcas.step.actions));
console.log('\nCSRF rotó entre pasos:', inicio.session.csrf !== marcas.session.csrf);
