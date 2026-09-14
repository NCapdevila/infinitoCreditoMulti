# Cotizador CE Brokers

Cotización y contratación de seguro de auto, operado por el vendedor de la
agencia: cotiza, elige cobertura y contrata sin cambiar de aplicación.

```
packages/
  bff/   traduce el motor htmx de infinito.foxia.ar a JSON
  web/   React + Tailwind: los pasos del cotizador y las pantallas S01–S13
```

## Levantarlo

```bash
npm install
npm run dev
```

Levanta los dos procesos juntos: el BFF en **5181** y la app en **5180**. Hacen
falta ambos — el front pide `/api` y Vite lo proxea al BFF, así que con uno
solo la app se queda sin pasos que mostrar.

### Pantalla de medio de pago

Sobre HTTP, Chrome deshabilita el autocompletado de tarjetas y superpone su
propia advertencia sobre el formulario. **En producción, con HTTPS, no
aparece.** Para comprobarlo en desarrollo:

```bash
npm run dev:https -w @infinito/web    # https://localhost:5443
```

El certificado es autofirmado, así que el navegador pide aceptarlo una vez.

Para correrlos por separado, en dos terminales:

```bash
npm run dev -w @infinito/bff
npm run dev -w @infinito/web
```

Variables del BFF: ver [.env.example](.env.example). El servidor las lee de un
`.env` en la raíz.

### Quién puede embeber la app, y quién llamar a la API

Son **dos listas distintas** y es fácil confundirlas, porque dentro de un
iframe el `fetch` sale con el origen de la app, no con el del sitio que la
embebe.

| Variable | Qué controla |
|---|---|
| `SITIOS_EMBEBIBLES` | Qué sitios pueden meter la app en un `<iframe>`. Es la que importa para el embebido. Sin definir, no la embebe nadie. |
| `ORIGENES_PERMITIDOS` | Desde qué origen se acepta una llamada a `/api`. Con el front y el BFF en el mismo dominio, **dejala vacía**: el mismo origen se reconoce solo. |

```
SITIOS_EMBEBIBLES=https://www.agencia-uno.com.ar,https://agencia-dos.com.ar
```

El embebido lo decide la cabecera `Content-Security-Policy: frame-ancestors`, y
la manda **quien sirve el HTML del front**. En desarrollo la manda Vite, con esa
misma variable. **En producción la tiene que mandar el servidor estático o el
CDN**: si no, el navegador deja que lo embeba cualquiera y la lista no sirve de
nada. Nginx:

```nginx
add_header Content-Security-Policy "frame-ancestors 'self' https://www.agencia-uno.com.ar https://agencia-dos.com.ar" always;
```

El BFF manda la misma cabecera en sus respuestas —cubre la constancia en PDF, que
también se puede embeber— y además rechaza con 403 lo que venga de un origen
ajeno, antes de mandar un correo o armar un PDF.

### Límites

`/api/solicitud` y `/api/certificado` no piden credenciales: cualquiera que sepa
la URL puede llamarlos. Contra eso hay dos topes, porque **CORS no alcanza** —un
`curl` no manda `Origin` ni mira las cabeceras de respuesta—:

- **20 envíos por hora y por IP** a esos dos endpoints (`LIMITE_POR_HORA`), lo
  que sobra para un vendedor y es poco para un script. Detrás de un reverse
  proxy hay que poner `CONFIAR_EN_PROXY=1`, o el límite termina siendo uno solo
  para todo el mundo. La cuenta vive en memoria: con más de una instancia, esto
  se muda al proxy o a Redis.
- **20 MB de cuerpo** en `/api/solicitud` (`LIMITE_SOLICITUD_MB`) y 1 MB en el
  resto, mirando lo que llega y no lo que el `Content-Length` declara. Sin esto
  un solo POST grande se come la memoria del proceso.

> **Lo que queda abierto:** los dos topes hacen el abuso caro, no imposible.
> Cerrarlo del todo pide que `/api/solicitud` exija una cotización viva —el `id`
> que ya emite el BFF, con su TTL de media hora—, de modo que para mandar un
> correo haya que recorrer el cotizador primero. Es un cambio chico de los dos
> lados y el paso siguiente natural.

### Constancia en PDF

El encabezado lleva el logo de CE Brokers a la izquierda y el de la aseguradora
a la derecha, desde `packages/bff/assets/`. Las rutas se resuelven relativas al
módulo, así que si en algún momento se compila a `dist/`, hay que copiar
`assets/` junto al build.

El logo de la compañía se busca por nombre normalizado, probando desde la razón
social completa hasta la primera palabra —así entra tanto «Zurich» como «Zurich
Argentina Compañía de Seguros S.A.»—. **Si aparece una aseguradora nueva, basta
con dejar su PNG en `assets/aseguradoras/` con el nombre en minúsculas y
guiones** (`san-cristobal.png`). Si falta, la constancia sale igual sin ese
logo: el nombre ya figura en el cuerpo, y es un documento que no puede dejar de
emitirse por una imagen.

### Correo

Al confirmar la solicitud salen **dos correos distintos**:

| A | Qué lleva |
|---|---|
| `MAIL_TO` (emisiones) | Todos los campos que cargó el vendedor, las nueve fotos y la constancia. Es lo que habilita emitir y, sin base de datos, el registro de la operación. |
| El comprador | Sólo su constancia de cobertura. **Nunca** datos de pago, fotos ni datos de la agencia. |

La dirección del comprador es la que dejó al cotizar. Si ese envío falla, la
solicitud ya llegó igual a emisiones: la pantalla final avisa para que el
vendedor le haga llegar la constancia él mismo.

Con Mailgun alcanza con las credenciales SMTP del dominio (Sending → Domain
settings → SMTP credentials; **no** es la API key):

```
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@midominio.mailgun.org
SMTP_PASS=...
MAIL_TO=emisiones@cebrokers.com.ar
MAIL_FROM=cotizador@midominio.mailgun.org
```

Para ver cómo queda el correo interno sin enviarlo:

```bash
npx tsx packages/bff/scripts/previsualizar-correo.mjs correo.html
```

Para comprobar que las credenciales andan, sin enviar nada:

```bash
node --env-file-if-exists=.env packages/bff/scripts/verificar-correo.mjs
```

Para probar el envío sin mandar correo de verdad hay un SMTP de juguete que
informa qué recibió:

```bash
node packages/bff/scripts/smtp-de-prueba.mjs
SMTP_HOST=localhost SMTP_PORT=2525 MAIL_TO=prueba@ejemplo.com npm run dev
```

**Las fotos se comprimen en el navegador antes de enviarse.** Nueve fotos de
celular suman unos 29 MB y ningún servidor de correo las acepta; comprimidas, el
envío queda en ~7 MB. Si el envío falla, se reintenta tres veces y recién
después la pantalla avisa, sin perder lo cargado.

> **Datos de tarjeta:** por decisión del negocio el correo lleva el número de
> tarjeta completo, lo que va en contra de PCI-DSS. Está anotado en
> `packages/bff/src/correo.ts`. La alternativa —mandar sólo los últimos cuatro
> dígitos— alcanza para que un emisor identifique el medio de pago.

Si al arrancar aparece `EADDRINUSE`, quedó un proceso viejo tomando el puerto:

```bash
netstat -ano | findstr :5181      # PowerShell
taskkill /PID <pid> /F
```

## Verificar

```bash
npm test -w @infinito/bff              # parseo del motor, contra fixtures reales
node packages/bff/scripts/e2e.mjs      # cotización completa contra el motor real
node packages/web/scripts/shots.mjs ./shots   # recorre la app y captura cada pantalla
```

`e2e.mjs` y `shots.mjs` **generan una cotización de verdad** en el motor. No
emiten pólizas, pero dejan registro.

## Cómo está armado

El motor de cotización es Django + htmx y no expone JSON: cada paso es un
fragmento de HTML. El BFF lo traduce y le sirve al front un `Step` normalizado
—los detalles están en [packages/bff/src/motor/API.md](packages/bff/src/motor/API.md)—
de modo que ninguna pantalla dependa del markup. El token de sesión y el CSRF
no salen del servidor.

La etapa 3 (contratación) vive entera en el front. Al confirmar, todo viaja por
correo con la constancia adjunta y no se persiste en ninguna base: la
trazabilidad, por ahora, es el id de mensaje que devuelve el proveedor y se
muestra en la pantalla final. Migrar a una base es el próximo paso previsto.

### Lo que hay que decidir antes de terminar

- **La rama 0 KM saltea las nueve fotos** (spec 7.3). Es la decisión de mayor
  impacto: está aislada en una línea del router de `App.tsx`.
- **No hay diseño para los estados de error** (spec 5.3). Lo que hay es lo
  mínimo legible, marcado como provisorio.
- **Faltan los textos de las nueve tomas de foto** (spec 7.5) y los catálogos
  definitivos de los selects (spec 7.4).
