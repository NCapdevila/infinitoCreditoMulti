/**
 * Verifica el camino «Cotizar con patente».
 *
 *   node scripts/patente.mjs ./shots [PATENTE]
 *
 * Con una patente que el motor no encuentre, la pantalla de confirmación avisa
 * y ofrece seguir eligiendo la marca a mano. Con una real, debería mostrar el
 * vehículo.
 */
import { chromium } from 'playwright';

const dir = process.argv[2] ?? './shots';
const PATENTE = process.argv[3] ?? 'AZ456CD';
const URL = process.env.APP_URL ?? 'http://localhost:5180/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('ERROR DE PAGINA:', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLA:', m.text()));

const shot = async (name) => {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/patente-${name}.png`, fullPage: true });
  console.log('  ✓', name);
};

await page.goto(URL, { waitUntil: 'networkidle' });
await page.getByRole('heading', { name: /patente de tu auto/ }).waitFor({ timeout: 30_000 });

await page.locator('#plate').fill(PATENTE);
await shot('escrita');

await page.getByRole('button', { name: 'Cotizar con patente' }).click();

// Antes del arreglo, acá volvía la misma pantalla y no pasaba nada.
await page
  .getByRole('heading', { name: /patente de tu auto/ })
  .waitFor({ state: 'detached', timeout: 30_000 });

const titulo = await page.getByRole('heading').first().innerText();
console.log('  avanzó a:', titulo.replace(/\s+/g, ' '));
await shot('confirmacion');

const botones = await page.getByRole('button').allInnerTexts();
console.log('  acciones:', botones.map((b) => b.trim()).filter(Boolean).join(' | '));

await page.getByRole('button', { name: 'Siguiente' }).first().click();
// Hay un request al BFF de por medio: sin esperar, se lee la pantalla vieja.
await page
  .getByRole('heading', { name: /Este es tu vehículo/ })
  .waitFor({ state: 'detached', timeout: 30_000 });
const siguiente = await page.getByRole('heading').first().innerText();
console.log('  siguiente:', siguiente.replace(/\s+/g, ' '));
await shot('tras-confirmar');

await browser.close();
