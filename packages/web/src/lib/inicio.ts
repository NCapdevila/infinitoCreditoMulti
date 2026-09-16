/**
 * Volver al inicio sin navegar.
 *
 * Antes era `window.location.href = '/'`. Adentro del iframe eso es un pedido
 * nuevo del HTML, y el BFF sólo lo sirve si viene de una agencia: ese pedido
 * sale del propio cotizador, sin el `Referer` de la agencia, y se lo rechazaba.
 * Además, bajar de nuevo la página entera para vaciar un formulario es de más.
 *
 * Así que se avisa con un evento y la raíz de la app se vuelve a montar desde
 * cero: mismo resultado que recargar, sin salir de la página.
 */

const EVENTO = 'cotizador:volver-al-inicio';

export function volverAlInicio(): void {
  window.dispatchEvent(new Event(EVENTO));
}

/** Se suscribe al aviso. Devuelve la función que desuscribe. */
export function alVolverAlInicio(hacer: () => void): () => void {
  window.addEventListener(EVENTO, hacer);
  return () => window.removeEventListener(EVENTO, hacer);
}
