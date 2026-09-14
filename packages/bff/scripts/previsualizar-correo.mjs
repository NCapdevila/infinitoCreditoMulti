/**
 * Previsualiza el correo interno sin enviarlo.
 *
 *   npx tsx scripts/previsualizar-correo.mjs correo.html
 *
 * Sirve para ajustar el diseño del mensaje —que es lo que ven los vendedores
 * todos los días— sin tener que completar el flujo ni mandar correos de prueba.
 */
import { armarHtml } from '../src/correo.ts';
import { writeFileSync } from 'node:fs';

const html = armarHtml({
  asunto: 'x',
  adjuntos: [],
  secciones: [
    { titulo: 'Cobertura elegida', filas: [
      ['Compañía', 'Meridional'],
      ['Cobertura', '[16] TERCEROS COMPLETOS PREMIUM'],
      ['Costo mensual', '$149.699'],
      ['Suma asegurada', '$12.786.500'],
    ]},
    { titulo: 'Asegurado', filas: [
      ['Tipo', 'Persona física'],
      ['Nombre', 'prueba emision'],
      ['DNI', '11223344'],
      ['Sexo', 'Masculino'],
      ['Condición fiscal', 'Consumidor final'],
      ['E-mail', 'prueba.emision@ejemplo.com'],
      ['Teléfono', '+549 11 22334455'],
    ]},
    { titulo: 'Domicilio del vehículo', filas: [
      ['Calle', 'siempre viva'], ['Altura', '123'],
      ['Piso / Depto', '—'], ['Localidad', 'CLAYPOLE (CP 1849)'],
    ]},
    { titulo: 'Vehículo', filas: [
      ['Marca', 'CITROEN'], ['Modelo', 'C 4'],
      ['Versión', 'C4 LOUNGE 1.6 HDI FEEL PACK'], ['Año', '2019'],
      ['Patente', 'AI531QZ'], ['Motor', 'TZ220XYE8X6016307'],
      ['Chasis', 'LC0C74C44T4299946'], ['Fotos', '9 de 9 adjuntas'],
    ]},
    { titulo: 'Medio de pago', filas: [
      ['Medio', 'Tarjeta de crédito'], ['Banco', 'Banco Santa Fe'],
      ['Tarjeta', 'VISA'], ['Número', '4545-0000-0300-5454'], ['Vencimiento', '02/28'],
    ]},
    { titulo: 'Agencia', filas: [
      ['Agencia', 'Automotores del Litoral'], ['Vendedor', 'Juan Perez'],
      ['Teléfono', '0344 15405536'], ['E-mail', 'juanperez@gmail.com'],
    ]},
  ],
});
writeFileSync(process.argv[2], `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">${html}</body>`);
console.log('vista previa en', process.argv[2]);
