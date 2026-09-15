/**
 * Previsualiza la constancia en PDF sin emitir nada.
 *
 *   npx tsx packages/bff/scripts/previsualizar-constancia.mjs constancia.pdf
 *
 * Sirve para ajustar el diseño del documento —encabezado, secciones, notas
 * legales— sin recorrer el cotizador entero ni mandar una solicitud.
 *
 * Con `--sin-logo` usa una aseguradora que todavía no tiene PNG en
 * `assets/aseguradoras/`, que es el otro caso que hay que mirar: el encabezado
 * tiene que verse bien igual, con el lugar del logo vacío.
 */
import { writeFileSync } from 'node:fs';
import { generarCertificado } from '../src/certificado.ts';

const salida = process.argv[2] ?? 'constancia.pdf';
const sinLogo = process.argv.includes('--sin-logo');

const pdf = await generarCertificado({
  asegurado: {
    nombre: 'PRUEBA EMISION',
    documento: '11223344',
    tipoDocumento: 'DNI',
    domicilio: 'siempre viva 123 (1849) CLAYPOLE',
  },
  poliza: {
    aseguradora: sinLogo ? 'Aseguradora Nueva S.A.' : 'Zurich',
    fechaCarga: new Date(),
  },
  vehiculo: {
    descripcion: 'C4 LOUNGE 1.6 HDI FEEL PACK',
    marca: 'CITROEN',
    modelo: 'C 4',
    anio: 2019,
    patente: 'AI531QZ',
    motor: 'TZ220XYE8X6016307',
    chasis: 'LC0C74C44T4299946',
  },
  cobertura: {
    codigo: '16',
    detalle: 'TERCEROS COMPLETOS PREMIUM',
    sumaAsegurada: '$ 12.786.500',
  },
});

writeFileSync(salida, pdf);
console.log(`constancia en ${salida} · ${(pdf.length / 1024).toFixed(0)} KB`);
