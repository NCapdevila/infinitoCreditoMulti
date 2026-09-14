/**
 * Recorre una cotización completa contra el motor real, a través del BFF.
 *
 *   npm run dev            # en otra terminal
 *   node scripts/e2e.mjs
 *
 * Genera una cotización de verdad en el motor: no es un test automático, es la
 * verificación de que la traducción aguanta el flujo entero.
 */
const BFF = process.env.BFF_URL ?? 'http://localhost:5181';

const pedir = async (ruta, init) => {
  const res = await fetch(`${BFF}${ruta}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const cuerpo = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${ruta}: ${JSON.stringify(cuerpo)}`);
  return cuerpo;
};

const mostrar = (paso) => {
  const detalle =
    paso.kind === 'choice'
      ? ` · ${paso.options.length} opciones${paso.optionsSource ? ' (catálogo)' : ''}`
      : paso.kind === 'text-input'
        ? ` · campos: ${paso.fields.map((f) => `${f.name}:${f.type}`).join(', ')}`
        : '';
  console.log(`  [${paso.id}] ${paso.kind.padEnd(10)} ${paso.title}${detalle}`);
};

console.log('── nueva cotización ──');
let { id, paso } = await pedir('/api/cotizaciones', { method: 'POST' });
mostrar(paso);

const avanzar = async (valores) => {
  ({ paso } = await pedir(`/api/cotizaciones/${id}/pasos`, {
    method: 'POST',
    body: JSON.stringify({ valores }),
  }));
  mostrar(paso);
};

const ir = async (step) => {
  ({ paso } = await pedir(`/api/cotizaciones/${id}/ir`, {
    method: 'POST',
    body: JSON.stringify({ step }),
  }));
  mostrar(paso);
};

/** Elige la primera opción, pidiéndola al catálogo si el paso no las trae. */
const elegirPrimera = async (filtro) => {
  let opciones = paso.options;
  if (opciones.length === 0) {
    ({ opciones } = await pedir(`/api/cotizaciones/${id}/opciones`));
    console.log(`      catálogo: ${opciones.length} opciones`);
  }
  const elegida = filtro ? opciones.find((o) => filtro(o)) : opciones[0];
  if (!elegida) throw new Error(`sin opción que sirva en ${paso.id}`);
  console.log(`      → ${elegida.label}`);
  await avanzar({ [paso.name]: elegida.value });
};

await ir('2sp');
await elegirPrimera((o) => o.value === 'volkswagen');
await elegirPrimera((o) => o.value === '2024');
await elegirPrimera();
await elegirPrimera();
await elegirPrimera((o) => o.label === 'Capital Federal');
await elegirPrimera();

await avanzar({ birth_date: '1976-01-01' });
await avanzar({ full_name: 'Prueba Integración' });
await avanzar({ email: 'notengomail@hotmail.com' });
await avanzar({ phone_prefix: '+549', phone_area: '11', phone_number: '22334455' });

console.log('\n── cotizando ──');
const empezo = Date.now();
let resultados;
let vueltas = 0;
let estables = 0;
let previo = -1;

while (Date.now() - empezo < 60_000) {
  resultados = await pedir(`/api/cotizaciones/${id}/resultados`);
  vueltas += 1;
  const seg = ((Date.now() - empezo) / 1000).toFixed(0);
  console.log(`  ${seg}s · ${resultados.total} planes` + (resultados.awaitingFirstResults ? ' (esperando)' : ''));

  estables = resultados.total === previo ? estables + 1 : 0;
  previo = resultados.total;
  if (estables >= 3 && resultados.total > 0) break;
  await new Promise((r) => setTimeout(r, 2000));
}

console.log(`\n── resultados (${vueltas} vueltas) ──`);
for (const g of resultados.groups) {
  console.log(`  ${g.name}: ${g.quotes.length} planes`);
}
const primera = resultados.groups.flatMap((g) => g.quotes)[0];
console.log('\nprimer plan:', JSON.stringify(primera, null, 2).slice(0, 420));

console.log('\n── elegir plan ──');
const elegido = await pedir(`/api/cotizaciones/${id}/elegir`, {
  method: 'POST',
  body: JSON.stringify({
    code: primera.code,
    insurance: primera.company,
    plan: primera.plan,
  }),
});
console.log('  elegido:', JSON.stringify(elegido.elegido));
console.log('  datos para la contratación:', JSON.stringify(elegido.valores));
