/**
 * Qué campos hacen falta para poder emitir.
 *
 * La regla la define negocio, no el diseño: todo es necesario salvo los datos
 * del vendedor —que la agencia puede no tener a mano— y el piso o departamento.
 *
 * En vez de dejar avanzar y mostrar errores después, el botón queda inactivo
 * hasta que estén los datos: el prototipo ya usa ese patrón en la carga de
 * fotos y en el documento de 0 KM.
 */

/**
 * Los campos que se pueden dejar vacíos.
 *
 * Está escrito como lista explícita para que quede en un solo lugar cuál es la
 * excepción; todo lo que no figure acá se completa antes de avanzar.
 */
export const OPCIONALES = [
  'Vendedor',
  'Teléfono del vendedor',
  'E-mail del vendedor',
  'Piso / Depto',
] as const;

const vacio = (valor: unknown) => typeof valor !== 'string' || valor.trim() === '';

/**
 * ¿Están todos los campos pedidos?
 *
 * Los nombres se validan contra el tipo del objeto: si un campo se renombra, el
 * typecheck avisa en vez de dejar una validación que no valida nada.
 */
export function completos<T extends object>(
  valores: T,
  requeridos: readonly (keyof T)[],
): boolean {
  return requeridos.every((campo) => !vacio(valores[campo]));
}
