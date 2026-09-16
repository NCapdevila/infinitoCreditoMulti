/**
 * El scroll de la app.
 *
 * La app se clava al alto de la ventana —o al del `<iframe>` que la embebe— y
 * el scroll pasa a un contenedor interno: el header queda fijo arriba, todo lo
 * demás scrollea debajo y el documento no crece nunca. Es el armazón que arma
 * `Screen`, y la razón por la que este módulo existe: el que quiera mover la
 * vista tiene que mover ese contenedor, no la ventana.
 *
 * Lo que lo motivó fue el embebido —adentro de un iframe `dvh` es el alto del
 * marco, no el del celular, así que la app se estiraba hasta el `height` que le
 * pusiera la agencia y dejaba cientos de píxeles de aire muerto—, pero el
 * comportamiento es el mismo suelta: el cotizador se ve como una aplicación y
 * no como un documento largo.
 *
 * Para quien arma el `<iframe>`: el `height` manda, y conviene uno chico,
 * **560–640 px**. Ninguna altura hace entrar todas las pantallas —«¿cuál es la
 * patente?» pide 603 px y la grilla de marcas 869—, así que estirarlo sólo deja
 * blanco en las cortas. Siempre en px: un `100vh` o un porcentaje adentro del
 * iframe se resuelve contra el marco, no contra el celular.
 */

/** El contenedor que scrollea. Lo pone `Screen`; hay uno solo por pantalla. */
export const ID_SCROLL = 'app-scroll';

/**
 * Sube al principio del paso siguiente.
 *
 * `window.scrollTo` no sirve: el documento no scrollea, está clavado al alto de
 * la ventana. Sin esto, avanzar desde el pie de un paso largo dejaba al vendedor
 * en mitad del paso nuevo.
 */
export function irArriba(): void {
  document.getElementById(ID_SCROLL)?.scrollTo({ top: 0 });
}
