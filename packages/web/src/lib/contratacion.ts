/**
 * Modelo de la contratación (etapa 3).
 *
 * Sigue la sección 6 de la spec funcional. La cobertura elegida no se captura
 * acá: llega del motor de cotización como la terna code/insurance/plan que
 * postea el botón «Contratar» de la etapa 2.
 */

export type TipoPersona = 'FISICA' | 'JURIDICA';
export type MedioDePagoTipo = 'TARJETA' | 'CBU';

/** Lo que entrega la etapa 2 al elegir un plan. */
export interface CoberturaElegida {
  /** String opaco: puede ser `CA7_CPlus` o traer ceros a la izquierda. */
  readonly code: string;
  readonly compania: string;
  readonly plan: string;
  readonly costoMensual: string;
  readonly sumaAsegurada?: string;
}

export interface DatosAgencia {
  nombre: string;
  vendedor: string;
  telefono: string;
  email: string;
}

export interface DatosAsegurado {
  tipoPersona: TipoPersona | null;
  nombreCompleto: string;
  dni: string;
  razonSocial: string;
  cuit: string;
  email: string;
  telefono: string;
  sexo: string;
  condicionFiscal: string;
}

export interface DomicilioVehiculo {
  /** Viene de la cotización: el motor lo captura en el paso de localidad. */
  readonly cp: string;
  readonly localidad: string;
  calle: string;
  altura: string;
  pisoDepto: string;
}

export interface DatosVehiculo {
  readonly marca: string;
  readonly modelo: string;
  readonly version: string;
  readonly anio: number;
  esCeroKm: boolean;
  patente: string;
  motor: string;
  chasis: string;
}

export interface Contratacion {
  readonly cobertura: CoberturaElegida;
  /** Datos del titular que ya capturó la etapa 2. */
  readonly contacto: { nombre: string; email: string; telefono: string };
  agencia: DatosAgencia;
  asegurado: DatosAsegurado;
  domicilio: DomicilioVehiculo;
  vehiculo: DatosVehiculo;
  fotos: FotoCargada[];
  /** Certificado de no rodamiento; sólo aplica a 0 KM. */
  documentoNoRodamiento: string | null;
  medioDePago: MedioDePago;
}

/**
 * Estado inicial con los datos que la etapa 2 ya resolvió.
 *
 * Los valores son los del prototipo: sirven para ver el flujo funcionando
 * mientras el BFF no está conectado.
 */
export const contratacionDeEjemplo: Contratacion = {
  cobertura: {
    code: '21',
    compania: 'Zurich',
    plan: 'RESPONSABILIDAD CIVIL',
    costoMensual: '$66.919',
    sumaAsegurada: '$37.312.000',
  },
  contacto: {
    nombre: 'Roberto Pérez',
    email: 'ejemplo@gmail.com',
    telefono: '+54 11 2345-6789',
  },
  agencia: { nombre: '', vendedor: '', telefono: '', email: '' },
  asegurado: {
    tipoPersona: null,
    nombreCompleto: '',
    dni: '',
    razonSocial: '',
    cuit: '',
    email: '',
    telefono: '',
    sexo: '',
    condicionFiscal: '',
  },
  domicilio: {
    cp: '3000',
    localidad: 'Santa Fe de la Veracruz',
    calle: '',
    altura: '',
    pisoDepto: '',
  },
  fotos: [],
  documentoNoRodamiento: null,
  medioDePago: {
    tipo: null,
    banco: '',
    marcaTarjeta: '',
    numero: '',
    vencimiento: '',
    cbu: '',
    tipoCuenta: '',
    titular: '',
    titularDni: '',
  },
  vehiculo: {
    marca: 'FIAT',
    modelo: 'Cronos',
    version: 'Cronos 1.3 Drive L/22 CVT',
    anio: 2024,
    esCeroKm: false,
    patente: '',
    motor: '',
    chasis: '',
  },
};

/** Catálogos que la spec marca como pendientes de confirmar (ambigüedad 7.4). */
export const SEXOS = [
  { value: 'FEMENINO', label: 'Femenino' },
  { value: 'MASCULINO', label: 'Masculino' },
] as const;

export const CONDICIONES_FISCALES = [
  { value: 'CONSUMIDOR_FINAL', label: 'Consumidor final' },
  { value: 'RESPONSABLE_INSCRIPTO', label: 'Responsable inscripto' },
  { value: 'MONOTRIBUTO', label: 'Responsable monotributo' },
  { value: 'EXENTO', label: 'Exento' },
] as const;

/**
 * Las nueve tomas de inspección.
 *
 * El prototipo las nombra distinto en el checklist y en la grilla de cargadas
 * («Tablero de contacto» / «Tablero en contacto», «Cédula verde/ título» /
 * «Cédula verde título»). Se resuelve con un enum único y una etiqueta
 * derivada de él, que era la recomendación de la spec (7.6).
 *
 * `ejemplo` apunta a la foto de referencia de cada toma: es lo que le muestra al
 * vendedor qué encuadre se espera. Los nombres de archivo no siguen a los
 * `tipo` —`lateral_izq` es el lado del conductor, e `interior` es el parabrisas
 * visto desde adentro—, así que conviene mirar la imagen antes de repuntarlas.
 */
export const TOMAS = [
  {
    tipo: 'FRENTE',
    label: 'Frente',
    tip: 'Tiene que verse la patente completa.',
    ejemplo: '/tomas/frente.png',
  },
  {
    tipo: 'TRASERA',
    label: 'Trasera',
    tip: 'Tiene que verse la patente completa.',
    ejemplo: '/tomas/trasera.png',
  },
  {
    tipo: 'LATERAL_CONDUCTOR',
    label: 'Lateral conductor',
    tip: 'Los vidrios tienen que estar visibles.',
    ejemplo: '/tomas/lateral_izq.png',
  },
  {
    tipo: 'LATERAL_PASAJERO',
    label: 'Lateral pasajero',
    tip: 'Los vidrios tienen que estar visibles.',
    ejemplo: '/tomas/lateral_der.png',
  },
  {
    tipo: 'PARABRISAS',
    label: 'Parabrisas',
    tip: 'Sin reflejos que tapen el vidrio.',
    ejemplo: '/tomas/interior.png',
  },
  {
    tipo: 'RUEDA_AUXILIO',
    label: 'Rueda de auxilio',
    ejemplo: '/tomas/rueda_auxilio.png',
  },
  {
    tipo: 'TABLERO_CONTACTO',
    label: 'Tablero de contacto',
    ejemplo: '/tomas/tablero.png',
  },
  { tipo: 'TECHO', label: 'Techo', ejemplo: '/tomas/techo.png' },
  // Sin ejemplo: el documento se reconoce solo y una imagen de muestra con
  // datos de otra persona confunde más de lo que ayuda.
  { tipo: 'CEDULA_VERDE', label: 'Cédula verde o título' },
] as const;

export type TipoToma = (typeof TOMAS)[number]['tipo'];

/**
 * Los tips de las cinco primeras son los del prototipo o una aproximación; los
 * textos definitivos de las nueve están pendientes de contenido (spec 7.5).
 */
export interface FotoCargada {
  readonly tipo: TipoToma;
  readonly nombreArchivo: string;
  /**
   * Data URL de la foto ya comprimida.
   *
   * Es la misma representación que se muestra en pantalla y que viaja en el
   * correo: así no puede pasar que el vendedor vea una foto y se envíe otra.
   */
  readonly previewUrl: string;
}

/** Reglas de archivo que declara el propio modal de carga. */
export const ARCHIVO = {
  extensiones: ['.jpg', '.jpeg', '.png', '.pdf'],
  accept: 'image/jpeg,image/png,application/pdf',
  maxBytes: 4 * 1024 * 1024,
  maxLabel: '4 MB',
} as const;

export interface MedioDePago {
  tipo: MedioDePagoTipo | null;
  banco: string;
  /** Tarjeta */
  marcaTarjeta: string;
  numero: string;
  vencimiento: string;
  /** CBU */
  cbu: string;
  tipoCuenta: string;
  /** Comunes */
  titular: string;
  titularDni: string;
}

export const MARCAS_TARJETA = [
  { value: 'VISA', label: 'Visa' },
  { value: 'MASTERCARD', label: 'Mastercard' },
  { value: 'AMEX', label: 'American Express' },
  { value: 'CABAL', label: 'Cabal' },
] as const;

export const TIPOS_CUENTA = [
  { value: 'CAJA_AHORRO', label: 'Caja de ahorro' },
  { value: 'CUENTA_CORRIENTE', label: 'Cuenta corriente' },
] as const;

export const medioDePagoVacio: MedioDePago = {
  tipo: null,
  banco: '',
  marcaTarjeta: '',
  numero: '',
  vencimiento: '',
  cbu: '',
  tipoCuenta: '',
  titular: '',
  titularDni: '',
};
