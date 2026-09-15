import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

/**
 * Constancia de emisión.
 *
 * Replica el formato que ya usa CE Brokers, con dos diferencias pedidas:
 * el ítem no incluye «Acreedor Prendario», y donde el original lleva número de
 * orden y fecha de emisión —datos que asigna la aseguradora al procesar— esta
 * constancia lleva la fecha de carga, que es lo que realmente ocurrió.
 */

export interface DatosCertificado {
  readonly asegurado: {
    readonly nombre: string;
    readonly documento: string;
    readonly tipoDocumento: 'DNI' | 'CUIT';
    readonly domicilio: string;
  };
  readonly poliza: {
    readonly aseguradora: string;
    /** Fecha en que se cargó la solicitud; encabeza la constancia. */
    readonly fechaCarga: Date;
  };
  readonly vehiculo: {
    readonly descripcion: string;
    readonly marca: string;
    readonly modelo: string;
    readonly anio: number;
    readonly patente: string;
    readonly motor: string;
    readonly chasis: string;
  };
  readonly cobertura: {
    readonly codigo: string;
    readonly detalle: string;
    readonly sumaAsegurada?: string;
  };
}

const COLORES = {
  barra: '#7F7F7F',
  barraItem: '#D9D9D9',
  texto: '#333333',
  suave: '#8A8A8A',
  cyan: '#33CCF6',
  navy: '#00357D',
  linea: '#DDDDDD',
} as const;

const MARGEN = 48;
const ANCHO = 595.28 - MARGEN * 2; // A4 menos márgenes

/**
 * Tamaños de tipografía, deducidos del documento original midiendo el ancho
 * que ocupa cada texto.
 *
 * El original juega con más contraste del que parece: título grande, datos
 * chicos y notas legales casi tan grandes como el título de sección. Igualarlos
 * «a ojo» achataba esa jerarquía.
 */
const TIPO = {
  titulo: 19,
  fecha: 7,
  seccion: 10.5,
  item: 8.5,
  fila: 7.5,
  nota: 10,
  pie: 6.5,
} as const;

/** Logo de CE Brokers, en resolución suficiente para imprimir. */
const LOGO = fileURLToPath(new URL('../assets/logo-ce-brokers.png', import.meta.url));
const LOGO_ANCHO = 132;
const LOGO_ALTO = LOGO_ANCHO / 5.63;

/**
 * Alto de la fila de logos: el más alto de los dos manda y el otro se centra
 * contra él. Ubicarlos por el borde superior los desalinea, porque las dos
 * marcas tienen proporciones distintas.
 */
const FILA_LOGOS = 24;

/**
 * Los logos de las aseguradoras se escalan al mismo alto que el de CE Brokers,
 * para que las dos marcas pesen igual en el encabezado.
 *
 * Por eso los PNG de `assets/aseguradoras/` van **recortados al logo**, sin
 * aire alrededor: los originales venían todos en un lienzo de 425×78 con el
 * logo adentro ocupando entre el 38 % y el 90 % del alto, así que escalar por
 * el lienzo los dejaba de tamaños muy distintos entre sí.
 *
 * Un tope de ancho, igual, para una marca muy apaisada: con la misma altura,
 * `mapfre` —de 8:1 contra el 5,6:1 de CE Brokers— se iba a 190 pt.
 */
const LOGO_ASEGURADORA_ANCHO_MAX = 150;

/**
 * Medidas de un PNG, leídas del encabezado IHDR.
 *
 * Hace falta el ancho para alinear el logo contra el margen derecho, y cada
 * aseguradora tiene su proporción. Son ocho bytes en una posición fija del
 * archivo: no justifica una dependencia.
 */
function medidasPng(ruta: string): { ancho: number; alto: number } {
  const datos = readFileSync(ruta);
  return { ancho: datos.readUInt32BE(16), alto: datos.readUInt32BE(20) };
}

const sinAcentos = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Archivo del logo de una aseguradora.
 *
 * El nombre puede llegar corto («Zurich», que es lo que manda el motor) o como
 * razón social completa («Zurich Argentina Compañía de Seguros S.A.»), así que
 * se prueban las dos formas: el nombre entero y sus primeras palabras.
 */
function logoDeAseguradora(nombre: string): string | undefined {
  const partes = sinAcentos(nombre)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ');

  // De más específico a más general: «san cristobal» antes que «san».
  for (let n = partes.length; n >= 1; n -= 1) {
    const archivo = partes.slice(0, n).join('-');
    const ruta = fileURLToPath(
      new URL(`../assets/aseguradoras/${archivo}.png`, import.meta.url),
    );
    if (existsSync(ruta)) return ruta;
  }
  return undefined;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const fechaLarga = (d: Date) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
const fechaCorta = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

const sumarAnios = (d: Date, n: number) => {
  const r = new Date(d);
  r.setFullYear(r.getFullYear() + n);
  return r;
};
const sumarMeses = (d: Date, n: number) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
};

/** Genera el PDF y lo devuelve completo, listo para descargar o adjuntar. */
export function generarCertificado(datos: DatosCertificado): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: MARGEN });
  const trozos: Buffer[] = [];
  doc.on('data', (t: Buffer) => trozos.push(t));
  const listo = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(trozos)));
  });

  const { asegurado, poliza, vehiculo, cobertura } = datos;
  const desde = poliza.fechaCarga;

  // ── encabezado ───────────────────────────────────────────────────────
  /*
   * Dos filas. Arriba las marcas, cada una contra su margen y del mismo alto.
   * Abajo el título centrado, con la fecha centrada debajo.
   *
   * Antes iba todo en una sola banda, con el título metido entre los dos logos:
   * parecían colgar de él en vez de encabezar la hoja.
   */
  const centrado = (alto: number) => MARGEN + (FILA_LOGOS - alto) / 2;

  // Los logos son archivos de marca, no texto dibujado: el degradado y la
  // tipografía propia no se reproducen con las fuentes del PDF.
  try {
    doc.image(LOGO, MARGEN, centrado(LOGO_ALTO), { width: LOGO_ANCHO });
  } catch {
    // Si el archivo faltara, el documento sale igual: es una constancia, no
    // puede caerse por un logo.
    doc
      .fontSize(15)
      .fillColor(COLORES.navy)
      .font('Helvetica-Bold')
      .text('CE BROKERS', MARGEN, centrado(15));
  }

  // El logo de la aseguradora va a la derecha, como en el documento original.
  // Si es una compañía nueva y todavía no tenemos su logo, el lugar queda
  // vacío: el nombre ya figura en el cuerpo del documento.
  const logoCia = logoDeAseguradora(poliza.aseguradora);
  if (logoCia !== undefined) {
    const medidas = medidasPng(logoCia);
    const alto = Math.min(LOGO_ALTO, (LOGO_ASEGURADORA_ANCHO_MAX * medidas.alto) / medidas.ancho);
    const ancho = (alto * medidas.ancho) / medidas.alto;
    doc.image(logoCia, MARGEN + ANCHO - ancho, centrado(alto), { height: alto });
  }

  /*
   * Segunda fila. El título arranca donde termina la columna del logo, y la
   * fecha queda debajo del logo, en el margen.
   *
   * `text(…, x, y)` ubica el texto por su borde superior, así que dos tamaños
   * distintos puestos en la misma `y` no se apoyan en la misma línea: la chica
   * flota. Bajarla la diferencia de ascendentes —la parte de la letra que sube
   * desde la base, 718/1000 del cuerpo en Helvetica— las nivela.
   */
  const yTitulo = MARGEN + FILA_LOGOS + 16;
  doc
    .fontSize(TIPO.titulo)
    .fillColor(COLORES.texto)
    .font('Helvetica')
    .text('Constancia de Emisión', MARGEN, yTitulo, { width: ANCHO, align: 'center' });

  doc
    .fontSize(TIPO.fecha)
    .fillColor(COLORES.suave)
    .text(`Buenos Aires, ${fechaLarga(desde)}`, MARGEN, yTitulo + TIPO.titulo + 5, {
      width: ANCHO,
      align: 'center',
    });

  doc.y = yTitulo + TIPO.titulo + 26;

  // ── secciones ────────────────────────────────────────────────────────
  const seccion = (titulo: string) => {
    const y = doc.y;
    doc.rect(MARGEN, y, ANCHO, 20).fill(COLORES.barra);
    doc
      .fontSize(TIPO.seccion)
      .fillColor('#FFFFFF')
      .font('Helvetica')
      .text(titulo, MARGEN + 8, y + 5);
    doc.y = y + 28;
  };

  const ALTO_FILA = 16;

  /**
   * Fila etiqueta/valor.
   *
   * Devuelve el alto que ocupó: un domicilio o el nombre de una aseguradora
   * entran en dos líneas y, si el llamador avanza un alto fijo, la fila
   * siguiente se le encima.
   */
  const fila = (
    label: string,
    valor: string,
    opciones: { columna?: 0 | 1 | 2; columnas?: 1 | 2 | 3; ocupa?: 1 | 2 } = {},
  ): number => {
    const { columna = 0, columnas = 1, ocupa = 1 } = opciones;
    const anchoCol = ANCHO / columnas;
    const x = MARGEN + 8 + anchoCol * columna;
    const anchoLabel = columnas === 1 ? 100 : 52;
    // `ocupa` deja que una celda se extienda sobre la columna siguiente: la
    // descripción del vehículo no entra en un tercio de la hoja.
    const anchoValor = anchoCol * ocupa - anchoLabel - 16;
    const y = doc.y;

    doc
      .fontSize(TIPO.fila)
      .fillColor(COLORES.texto)
      .font('Helvetica-Bold')
      .text(label, x, y, { width: anchoLabel });

    doc.font('Helvetica');
    const alto = doc.heightOfString(valor, { width: anchoValor });
    doc.text(valor, x + anchoLabel + 5, y, { width: anchoValor });

    doc.y = y;
    return Math.max(ALTO_FILA, alto + 4);
  };

  /** Escribe una fila de una sola columna y baja lo que haga falta. */
  const filaSimple = (label: string, valor: string) => {
    const alto = fila(label, valor);
    doc.y += alto;
  };

  /**
   * Escribe una línea del ítem sobre una grilla fija de tres columnas.
   *
   * La grilla es siempre de tres aunque la fila use menos: así «Marca», «Uso» y
   * «Chasis» caen en la misma columna, como en el documento original. Un hueco
   * se deja con `null`.
   */
  const filaColumnas = (
    celdas: readonly (readonly [string, string] | null)[],
    ocupa: 1 | 2 = 1,
  ) => {
    const y = doc.y;
    let alto = ALTO_FILA;
    celdas.forEach((celda, i) => {
      if (celda === null) return;
      doc.y = y;
      alto = Math.max(
        alto,
        fila(celda[0], celda[1], {
          columna: i as 0 | 1 | 2,
          columnas: 3,
          // Sólo la primera celda se ensancha; las demás mantienen su columna.
          ocupa: i === 0 ? ocupa : 1,
        }),
      );
    });
    doc.y = y + alto;
  };

  seccion('Datos del Asegurado');
  filaSimple('Asegurado', asegurado.nombre);
  filaSimple('Domicilio', asegurado.domicilio);
  filaSimple('Documento', `${asegurado.tipoDocumento} ${asegurado.documento}`);
  doc.y += 8;

  seccion('Datos de la Póliza');
  filaSimple('Riesgo', 'AUTOMOTORES');
  filaSimple('Nro Poliza', 'EN TRAMITE');
  filaSimple('Nro Endoso', '-');
  filaSimple('Aseguradora', poliza.aseguradora.toUpperCase());
  filaSimple('Moneda', 'Pesos');
  // La emisión todavía no ocurrió: lo que hay es la fecha de carga.
  filaSimple('Fecha de carga', fechaCorta(desde));
  filaSimple('Vigencia Poliza', `${fechaCorta(desde)} al ${fechaCorta(sumarAnios(desde, 1))}`);
  filaSimple('Vigencia Operacion', `${fechaCorta(desde)} al ${fechaCorta(sumarMeses(desde, 1))}`);
  doc.y += 8;

  seccion('Detalle de Bienes Asegurados');

  // barra del ítem
  const yItem = doc.y;
  doc.rect(MARGEN, yItem, ANCHO, 16).fill(COLORES.barraItem);
  doc
    .fontSize(TIPO.item)
    .fillColor(COLORES.texto)
    .font('Helvetica')
    .text(`ITEM 1 (PATENTE: ${vehiculo.patente})`, MARGEN + 8, yItem + 4);
  doc.y = yItem + 24;

  // Mismo armado que el original, sin la fila «Acreedor Prendario».
  // La descripción usa dos columnas: en una sola se parte en dos líneas.
  filaColumnas([['Vehículo', vehiculo.descripcion], null, ['Marca', vehiculo.marca]], 2);
  filaColumnas([
    ['Modelo', vehiculo.modelo],
    ['Año', String(vehiculo.anio)],
    ['Uso', 'PARTICULAR'],
  ]);
  filaColumnas([
    ['Patente', vehiculo.patente],
    ['Motor', vehiculo.motor],
    ['Chasis', vehiculo.chasis],
  ]);

  if (cobertura.sumaAsegurada !== undefined) {
    filaSimple('Suma Asegurada Total', cobertura.sumaAsegurada);
  }
  doc.y += 6;

  // ── coberturas ───────────────────────────────────────────────────────
  const yCob = doc.y;
  doc.rect(MARGEN, yCob, ANCHO, 16).fill(COLORES.barraItem);
  doc
    .fontSize(TIPO.item)
    .fillColor(COLORES.suave)
    .font('Helvetica')
    .text('COBERTURAS', MARGEN + 8, yCob + 4);
  doc.y = yCob + 24;

  const yLinea = doc.y;
  doc
    .fontSize(TIPO.item)
    .fillColor(COLORES.texto)
    .text(`${cobertura.codigo} - ${cobertura.detalle}`, MARGEN + 8, yLinea, { width: ANCHO - 160 });
  if (cobertura.sumaAsegurada !== undefined) {
    doc.text(cobertura.sumaAsegurada, MARGEN, yLinea, {
      width: ANCHO - 8,
      align: 'right',
    });
  }
  doc.y = yLinea + 24;

  doc
    .moveTo(MARGEN, doc.y)
    .lineTo(MARGEN + ANCHO, doc.y)
    .strokeColor(COLORES.linea)
    .stroke();
  doc.y += 12;

  // ── notas legales ────────────────────────────────────────────────────
  const notas = [
    'El presente es un instrumento provisorio. Dentro de los QUINCE (15) días corridos, contados a partir de su fecha de emisión, la aseguradora deberá entregar la póliza respectiva.',
    'La cobertura prevista en la presente constancia se encuentra sujeta a los términos y condiciones previstos en las Condiciones Generales de la póliza.',
    'VEHICULO CUBIERTO POR SEGURO OBLIGATORIO AUTOMOTOR Según Res. Nro 36.100 del 19/09/2011 de la Superintendencia de Seguros de la Nación.',
  ];
  // Las notas van casi al tamaño del título de sección: en el original pesan
  // visualmente, no son letra chica.
  doc.fontSize(TIPO.nota).fillColor(COLORES.suave).font('Helvetica');
  for (const nota of notas) {
    doc.text(`* ${nota}`, MARGEN, doc.y, { width: ANCHO, align: 'left', lineGap: 2 });
    doc.y += 10;
  }

  // ── pie ──────────────────────────────────────────────────────────────
  /*
   * El pie se ancla al final de la hoja con `lineBreak` acotado: al agrandar la
   * tipografía, el texto pasaba a una segunda página en blanco. `height` le
   * pone techo y evita que pdfkit decida saltar de página.
   */
  const PIE =
    'CE BROKERS - SEGUIMOS AVANZANDO // SEGUI 4646 PISO 4, PALERMO - CABA - BUENOS AIRES, ' +
    'ARGENTINA // +54 11 5032-6736 // contacto@cebrokers.com.ar // MATRICULA SSN 1205';
  doc.fontSize(TIPO.pie).fillColor(COLORES.suave).font('Helvetica');
  const altoPie = doc.heightOfString(PIE, { width: ANCHO });
  doc.text(PIE, MARGEN, 794 - altoPie, { width: ANCHO, align: 'left', height: altoPie });

  doc.end();
  return listo;
}
