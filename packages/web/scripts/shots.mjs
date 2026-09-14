/**
 * Recorre el flujo completo y captura cada pantalla.
 *
 *   npm run dev -w @infinito/bff    # el BFF, en otra terminal
 *   npx vite --port 5180            # el front
 *   node scripts/shots.mjs ./shots
 *
 * Camina la app como lo haría un vendedor: cotiza sin patente contra el motor
 * real, elige cobertura y sigue con la contratación. Si un paso deja de ser
 * alcanzable el script falla, en vez de sacar otra foto de la pantalla anterior.
 */
import { chromium } from 'playwright';

const dir = process.argv[2] ?? './shots';
const URL = process.env.APP_URL ?? 'http://localhost:5180/';
const FOTO = process.env.FOTO_PRUEBA;

/** `VIEWPORT=desktop` captura a 1440 px para revisar el layout de escritorio. */
const ESCRITORIO = process.env.VIEWPORT === 'desktop';
const viewport = ESCRITORIO ? { width: 1440, height: 900 } : { width: 390, height: 844 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport, deviceScaleFactor: ESCRITORIO ? 1 : 2 });

page.on('pageerror', (e) => console.log('ERROR DE PAGINA:', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLA:', m.text());
});
page.on('dialog', (d) => d.dismiss());

let n = 0;
const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({
    path: `${dir}/${String(++n).padStart(2, '0')}-${name}.png`,
    fullPage: true,
  });
  console.log('  ✓', name);
};

/** Espera el título de la pantalla siguiente: los pasos van contra el motor real. */
const esperarTitulo = (texto) =>
  page.getByRole('heading', { name: texto }).waitFor({ timeout: 30_000 });

await page.goto(URL, { waitUntil: 'networkidle' });

// ── Etapa 1–2: cotización contra el motor ──────────────────────────────
await esperarTitulo(/patente de tu auto/);
await shot('Q-patente');
await page.getByRole('button', { name: /Cotizar sin patente/ }).click();

await esperarTitulo(/Cuál es la marca/);
// Los logos vienen del motor: sin esperarlos, las últimas tarjetas salen vacías.
await page.waitForFunction(
  () => [...document.images].every((img) => img.complete && img.naturalWidth > 0),
  null,
  { timeout: 15_000 },
);
await shot('Q-marca');
await page.getByRole('button', { name: 'Volkswagen' }).click();

await esperarTitulo(/Cuál es el año/);
await shot('Q-anio');
await page.getByRole('button', { name: '2024', exact: true }).click();

await esperarTitulo(/Qué modelo es/);
await page.getByRole('button', { name: 'AMAROK', exact: true }).waitFor({ timeout: 30_000 });
await shot('Q-modelo');
await page.getByRole('button', { name: 'AMAROK', exact: true }).click();

await esperarTitulo(/Cuál es la versión/);
await page.getByRole('button', { name: /AMAROK/ }).first().waitFor({ timeout: 30_000 });
await shot('Q-version');
await page.getByRole('button', { name: /AMAROK/ }).first().click();

await esperarTitulo(/En qué zona vivís/);
await page.getByRole('button', { name: 'Capital Federal', exact: true }).waitFor({ timeout: 30_000 });
await shot('Q-provincia');
await page.getByRole('button', { name: 'Capital Federal', exact: true }).click();

await esperarTitulo(/En qué localidad/);
await page.getByLabel(/Buscar por localidad/).waitFor({ timeout: 30_000 });
await shot('Q-localidad');
await page.getByLabel(/Buscar por localidad/).fill('AGRONOM');
await shot('Q-localidad-filtrada');
await page.getByRole('button', { name: /AGRONOMÍA/ }).first().click();

await esperarTitulo(/fecha de nacimiento/);
await shot('Q-nacimiento');
await page.locator('#birth_date').fill('1976-01-01');
await page.getByRole('button', { name: 'Siguiente' }).click();

await esperarTitulo(/Cómo te llamas/);
await shot('Q-nombre');
await page.locator('#full_name').fill('Prueba Integración');
await page.getByRole('button', { name: 'Siguiente' }).click();

await esperarTitulo(/tu e-mail/);
await shot('Q-email');
await page.locator('#email').fill('notengomail@hotmail.com');
await page.getByRole('button', { name: 'Siguiente' }).click();

await esperarTitulo(/Tu celular/);
await shot('Q-celular');
await page.locator('#phone_area').fill('11');
await page.locator('#phone_number').fill('22334455');
await page.getByRole('button', { name: 'Ver precios' }).click();

await esperarTitulo(/por esperar/);
await shot('Q-buscando');

// Las compañías responden por olas: primero aparecen unos pocos planes.
await page.getByRole('heading', { name: /Elegí tu cobertura/ }).waitFor({ timeout: 90_000 });
await shot('Q-resultados-parcial');

// El aviso «Seguimos buscando» se va cuando el polling se estabiliza.
await page.getByText(/Seguimos buscando/).waitFor({ state: 'detached', timeout: 90_000 });
const coberturas = await page.getByRole('button', { name: /\(\d+\)/ }).allInnerTexts();
console.log('  coberturas:', coberturas.map((c) => c.replace(/\s+/g, ' ').trim()).join(' | '));
await page.waitForFunction(() => [...document.images].every((img) => img.complete), null, {
  timeout: 15_000,
});
await shot('Q-resultados');

// ── Etapa 3: contratación ──────────────────────────────────────────────
await page.getByRole('button', { name: /^Contratar$/ }).first().click();
await esperarTitulo(/Ya elegiste/);
await shot('S01-cobertura');

await page.getByRole('button', { name: 'Contratar Online' }).click();
await shot('S02-agencia');

// Sólo la agencia es obligatoria; el resto son datos del vendedor.
await page.locator('#agencia-nombre').fill('Automotores del Litoral');
await page.locator('#agencia-vendedor').fill('Juan Perez');
await page.locator('#agencia-telefono').fill('0344 15405536');
await page.locator('#agencia-email').fill('juanperez@gmail.com');
await page.getByRole('button', { name: 'Siguiente' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Siguiente' }).click();

await page.getByRole('button', { name: 'Persona Física' }).click();
// Todos estos son obligatorios: sin ellos el botón queda inactivo.
await page.locator('#asegurado-nombre').fill('Roberto Pérez');
await page.locator('#asegurado-dni').fill('36555668');
await page.locator('#asegurado-email').fill('roberto@gmail.com');
await page.locator('#asegurado-telefono').fill('+541122334455');
await page.getByRole('button', { name: 'Siguiente' }).click();
await shot('S05-complemento');

await page.locator('#asegurado-sexo').selectOption('MASCULINO');
await page.locator('#asegurado-condicion-fiscal').selectOption('MONOTRIBUTO');
await page.getByRole('button', { name: 'Siguiente' }).click();

await page.locator('#domicilio-calle').fill('Pje. Chacabuco');
await page.locator('#domicilio-altura').fill('2486');
await page.getByRole('button', { name: 'Siguiente' }).click();
await shot('S07-vehiculo');

await page.locator('#vehiculo-patente').fill('AZ456CD');
await page.locator('#vehiculo-motor').fill('10JBED0123456');
await page.locator('#vehiculo-chasis').fill('8AEJKLCEG123456');
await page.getByRole('button', { name: 'Siguiente' }).click();
await shot('S08-intro-fotos');

await page.getByRole('button', { name: 'Empezar' }).click();
await shot('S09-checklist-vacio');

if (FOTO !== undefined) {
  await page.getByRole('button', { name: /^Frente/ }).click();
  await shot('S09b-modal-foto');
  await page.getByRole('dialog').locator('input[type="file"]').setInputFiles(FOTO);

  for (const nombre of [
    'Trasera', 'Lateral conductor', 'Lateral pasajero', 'Parabrisas',
    'Rueda de auxilio', 'Tablero de contacto', 'Techo', 'Cédula verde o título',
  ]) {
    await page.getByRole('button', { name: new RegExp(`^${nombre}`) }).click();
    await page.getByRole('dialog').locator('input[type="file"]').setInputFiles(FOTO);
  }
  await shot('S09-checklist-completo');

  await page.getByRole('button', { name: 'Siguiente' }).click();
  await shot('S10-fotos-cargadas');
  await page.getByRole('button', { name: 'Siguiente' }).click();
} else {
  console.log('  (sin FOTO_PRUEBA: se saltea la carga de fotos)');
}

await shot('S11-pago');
await page.getByRole('button', { name: 'Tarjeta de crédito' }).click();
await page.locator('#pago-banco').fill('Banco Santa Fe');
await page.locator('#pago-marca').selectOption('VISA');
await page.locator('#pago-numero').fill('4545000003005454');
await page.locator('#pago-vencimiento').fill('0228');
await page.locator('#pago-titular').fill('Roberto Pérez');
await page.locator('#pago-titular-dni').fill('36555668');
await shot('S11-tarjeta');

await page.getByRole('button', { name: 'Siguiente' }).click();
await shot('S12-resumen');

// Confirmar manda la solicitud por correo y va directo al cierre: el modal de
// emisión asistida quedó fuera del flujo.
await page.getByRole('button', { name: 'Confirmar datos' }).click();
await page.getByRole('heading', { name: /proceso de emisión/ }).waitFor({ timeout: 60_000 });
await shot('S13-emision');

await browser.close();
console.log('listo:', n, 'capturas');
