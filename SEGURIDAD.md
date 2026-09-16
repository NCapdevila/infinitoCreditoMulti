# Seguridad del cotizador embebido

El cotizador se embebe con un `<iframe>` en los sitios de agencia de
`SITIOS_EMBEBIBLES`. Las agencias no cambian nada de su lado: pegan el mismo
iframe, sin token ni script. Todo se resuelve en este repo y en su despliegue.

No sabemos quién es el usuario. Los objetivos son dos: que la app **no funcione
fuera de un sitio habilitado**, y que **abusar de la API con scripts sea inútil o
muy caro**.

## Qué se protege

| Endpoint | Por qué importa |
|---|---|
| `POST /api/certificado` | Arma una constancia con el logo de CE Brokers. Sin controles, sirve para falsificarlas. |
| `POST /api/solicitud` | Manda correo a emisiones y al comprador, con asunto de CE Brokers y un PDF adjunto. Sin controles, sirve para phishing y para spam. |
| `POST /api/cotizaciones` | Abre una sesión en el motor. Es lo que un script repetiría en loop. |

## Las capas

Cada una frena algo que las otras no. Ninguna sola alcanza.

### 1 · Pase de embebido — `pase.ts`

En producción el HTML lo sirve el BFF. Si el pedido del documento viene de un
iframe (`Sec-Fetch-Dest: iframe`) de una agencia habilitada (`Referer`), la
página sale con un pase HMAC-SHA256 en `<meta name="pase">`. Ese pase dura 2 h y
guarda el origen. Si el pedido no cumple, sale un 403 con una página mínima. El
front manda el pase en `Authorization: Pase <token>` y todo `/api` lo exige.

- **Frena:** abrir el cotizador en una pestaña o desde un sitio no habilitado;
  un `curl` directo a `/api`; operar una cotización con un pase de otra
  agencia (403); una agencia recién sacada de la lista, que pierde sus pases al
  instante.
- **No frena:** un script. Puede pedir el HTML inventando `Sec-Fetch-Dest` y
  `Referer` y llevarse un pase válido. Para eso están las capas 2 y 3.
- Sin `Sec-Fetch-Dest` (Safari anterior a 16.4) decide el `Referer` solo.
- No usa cookies: adentro de un iframe el cotizador es un tercero, y Safari y
  Chrome bloquean esas cookies.

### 2 · reCAPTCHA v3 — `recaptcha.ts`

El front pide un token justo antes de crear la cotización (`cotizar`), la
constancia (`constancia`) y la solicitud (`solicitud`). El BFF lo verifica con
Google y rechaza con 403 si `success` es false, si la acción no coincide, si el
hostname no es el de la app o si el puntaje queda bajo el mínimo. Si Google no
contesta, rechaza con 503.

- **Frena:** scripts. Un token con buen puntaje sale de un navegador de verdad
  usado por una persona, y cada uno sirve para una sola acción y una sola vez.
- **No frena:** a quien automatiza un navegador real o paga un servicio de
  resolución. Lo encarece, no lo imposibilita.
- Falla cerrado: si Google se cae, no se puede cotizar ni emitir.

### 3 · Cotización real — `cotizaciones.ts`, `emision.ts`

La constancia y la solicitud exigen el `cotizacionId` de una cotización vigente,
de la misma agencia del pase y con plan elegido. El plan se toma de los
resultados del motor al elegir. La compañía, la cobertura, la suma asegurada, el
vehículo cotizado, la fecha y el asunto del correo salen del servidor, no del
pedido. Cada cotización manda una sola solicitud (la segunda da 409).

- **Frena:** falsificar una constancia con datos inventados; mandar correos sin
  recorrer el cotizador entero; repetir el envío de una misma cotización.
- **No frena:** los datos declarativos del formulario —asegurado, domicilio,
  motor, chasis, medio de pago—. Los carga el vendedor y el servidor no tiene
  contra qué compararlos.
- Vencimiento por inactividad: 30 min mientras se cotiza y 2 h con plan elegido.

### 4 · Adjuntos — `adjuntos.ts`

Sólo JPEG, PNG, WEBP y PDF, reconocidos por los primeros bytes del contenido y
no por el tipo declarado. El nombre lo pone el servidor a partir de la clave de
la toma (`foto-frente.png`, `cedula.pdf`), que sale de una lista cerrada. Por
defecto el máximo es de 12 adjuntos y 5 MB cada uno.

- **Frena:** un ejecutable o un HTML que llega a emisiones con cara de foto, y
  nombres de archivo elegidos por el cliente.
- **No frena:** una imagen o un PDF legítimos con contenido engañoso.

### Lo que ya estaba

- **`frame-ancestors`**: el navegador se niega a mostrar el iframe fuera de la
  lista. Lo manda el BFF con el HTML, y Vite en desarrollo.
- **CORS**: `/api` sólo acepta llamadas del mismo origen o de
  `ORIGENES_PERMITIDOS`.
- **Rate limit**: 20 envíos por hora y por IP a la constancia y a la solicitud.
- **Tope de cuerpo**: 20 MB en la solicitud y 1 MB en el resto.

## Lo que queda abierto

- **Un pase filtrado se puede usar hasta que vence**, desde cualquier lado. Las
  operaciones caras igual piden reCAPTCHA.
- **El estado vive en memoria.** Reiniciar el BFF corta las cargas en curso, y
  con más de una instancia el rate limit y las cotizaciones no se comparten.
- **El motor (`infinito.foxia.ar`) no es nuestro.** Se lo puede llamar directo,
  sin pasar por nada de esto.
- **Una agencia con `Referrer-Policy: no-referrer`** no puede cargar el
  cotizador. En el log aparece como `[pase] sin referer`.

## Despliegue

Todo esto depende del `.env` de producción (ver `.env.example`):

- `NODE_ENV=production`. Sin eso, el BFF deja abrir la app desde localhost y
  firma con un secreto público.
- `PASE_SECRETO` de 32 caracteres o más y `RECAPTCHA_SECRETO`. Sin alguno de los
  dos, el BFF no arranca.
- `VITE_RECAPTCHA_SITE_KEY` al compilar. Si cambia, hay que volver a correr el
  build.
- El proxy le pasa **todo** al BFF, no sólo `/api`, y conserva el `Host`.

## Cómo probarlo a mano

Contra el BFF en producción (`https://infinito.cebrokers.com.ar`):

```bash
# Abrir directo → 403 con la página «sólo disponible desde el sitio de tu agencia»
curl -i https://infinito.cebrokers.com.ar/

# La API sin pase → 401
curl -i -X POST https://infinito.cebrokers.com.ar/api/certificado \
  -H 'Content-Type: application/json' -d '{"asegurado":{"nombre":"X"}}'

# Adjuntos rechazados, sin tocar el correo real (con el SMTP de juguete)
node packages/bff/scripts/smtp-de-prueba.mjs
```

Para probar embebido: una página en un dominio de `SITIOS_EMBEBIBLES` con el
iframe tiene que cargar. La misma página en otro dominio no tiene que cargar, y
la consola del navegador lo atribuye a `frame-ancestors`.

Qué mirar en el log del BFF:

- `[pase] …`: cada rechazo del HTML o de la API, con el motivo.
- `[recaptcha] <acción> · score <n> · ok|rechazado: <motivo>`: sirve para
  ajustar `RECAPTCHA_SCORE_MINIMO` con tráfico real.

## Retroceso

El estado anterior quedó marcado con el tag `antes-seguridad`. Sin reescribir
historia:

```bash
git revert <commit>                                  # deshacer un punto
git revert --no-commit antes-seguridad..HEAD && git commit -m "Revertir seguridad"   # deshacer todo
```
