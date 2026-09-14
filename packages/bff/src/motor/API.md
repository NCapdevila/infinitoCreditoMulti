# El motor de cotización

Notas de integración con `infinito.foxia.ar`, reconstruidas de un HAR de una
cotización real (11/09/2026) y del recorrido del embed. **No hay documentación
oficial ni API JSON**: el motor es Django + htmx y todo lo que devuelve es HTML.

Lo que sigue es el contrato observado. Si algo acá deja de ser cierto, los tests
de `parse.test.ts` y `quotations.test.ts` son los que avisan.

## Flujo de la cotización (etapas 1–2)

Todos los POST van a
`/embed/partial/infinitocredito/<uuid>?s=<sesión>&step=<id>` y llevan
`csrfmiddlewaretoken`. El CSRF **rota en cada respuesta**: hay que releerlo del
fragmento anterior o el motor rechaza el POST.

| Step | Campo que postea | Ejemplo |
|---|---|---|
| `1` | `plate` | `AZ456CD` — con patente, sigue en `2cp` |
| `2sp` | `brand` | `volkswagen` — sin patente |
| `4sp` | `year` | `2024` |
| `6sp` | `model` | `AMAROK\|39` (label + id) |
| `8sp` | `version` | `AMAROK 20TD 4X2 DC COMFORT` |
| `2_1` | `province` | `Capital Federal\|1` |
| `2_2` | `locality` | `AGRONOMÍA\|319\|1431` (label + id + CP) |
| `2_3` | `birth_date` | `1976-01-01` |
| `2_4` | `full_name` | |
| `2_5` | `email` | |
| `2_6` | `phone_prefix`, `phone_area`, `phone_number` | `+549`, `11`, `22334455` |

La numeración no es secuencial: `2sp` declara `next=4sp`, y `3sp` es el listado
completo de marcas — una salida lateral, no el paso siguiente.

Los valores compuestos usan `|` como separador. **El CP sale de acá**, en el
tercer campo de `locality`: es el mismo que la etapa 3 muestra como read-only.

### Endpoints auxiliares

Devuelven listados para los selectores. POST con `search` (vacío trae todo):

- `/embed/models?s=<sesión>`
- `/embed/versions?s=<sesión>`
- `/embed/provinces?s=<sesión>`
- `/embed/localities?s=<sesión>` — ~400 KB, la lista completa del país
- `/embed/email/select` y `/embed/phone/select` — validan y normalizan

## Cotización y resultados

`POST /embed/save/infinitocredito/<uuid>?s=<sesión>` cierra los datos y
devuelve el contenedor que dispara el polling:

```html
<div id="quotations-container"
     hx-trigger="load, every 2s"
     hx-get="/embed/quotations/<sesión>"></div>
```

`GET /embed/quotations/<sesión>` devuelve el estado actual. Las compañías
responden en paralelo y los resultados llegan en olas — en la cotización
observada, 0 → 5 → 15 → 27 → 33 planes a lo largo de ~22 segundos.

**El motor nunca dice que terminó.** El front original pollea cada 2 s
indefinidamente. Los spinners (`.loading-section`) desaparecen con el primer
resultado aunque falten compañías, y el conteo del encabezado
(`Todo Riesgo (10)`) refleja lo recibido, no lo esperado. Por eso el corte lo
decide `MotorClient.pollQuotations` por estabilidad del total, con tope duro.

Estructura: 5 acordeones de cobertura (Responsabilidad Civil, Terceros Básico,
Terceros Completos, Terceros Completos Premium, Todo Riesgo), cada uno con las
tarjetas de las compañías que cotizaron.

## La frontera con la etapa 3

El botón `Contratar` de cada tarjeta postea a
`/embed/step4_1/infinitocredito/<uuid>?s=<sesión>` con:

```json
{ "code": "21", "insurance": "Zurich", "insurance_plan": "RESPONSABILIDAD CIVIL" }
```

Esa terna es lo que la etapa 3 recibe como cobertura elegida — el equivalente al
`cotizacionId` de la spec funcional.

`code` es **un string opaco**: San Cristóbal usa `CA7_CPlus`, Meridional escribe
`01` con cero a la izquierda y Sancor tiene un plan `1`. Convertirlo a número
hace colisionar pólizas distintas.

## Pasos con buscador

Modelo, versión, provincia y localidad llegan **sin opciones**: el fragmento
trae la lista vacía y el propio input de búsqueda declara de dónde pedirla.

```html
<input class="search-input" hx-post="/embed/models?s=…"
       hx-trigger="load[…children.length === 0]" oninput="filterModels(this.value)">
```

El parser lo expone como `optionsSource`, y `MotorClient.loadOptions` lo
resuelve. El endpoint devuelve la lista entera —831 localidades— y el filtrado
es en el cliente, igual que en el multi.

El campo que hay que postear **no** es el del input visible (que se llama
`search`): se deduce del endpoint, que es lo único estable.

## Pantalla de espera

El POST del último paso devuelve «¡Gracias por esperar!», que no tiene
formulario. Se modela como `kind: 'waiting'`: no es un paso que el usuario
complete, es la señal de que hay que llamar a `/embed/save/` y empezar a pedir
resultados.

## Cosas a tener en cuenta

- **reCAPTCHA está bypasseado en producción** (`/static/js/recaptcha.js`): la
  validación real está comentada. El endpoint `/embed/validate-recaptcha/`
  existe pero el cliente nunca lo llama.
- `/static/assets/cart.gif`, la animación de la pantalla de espera, pesa
  **2,4 MB**. Es la descarga más grande de todo el flujo, y cae justo en el
  momento de mayor ansiedad del usuario.
- Django valida `Referer` en los POST sobre HTTPS.
- Sin el header `HX-Request: true` el motor devuelve la página entera en vez del
  fragmento.
- Los títulos vienen partidos con `<br>` («¿Cuál es tu fecha<br/>de nacimiento?»).
  Hay que convertirlos en espacio o las palabras quedan pegadas.
- Los valores de los catálogos viajan compuestos con `|`: `AMAROK|39`,
  `AGRONOMÍA|310|1417`. Se mandan de vuelta tal cual, y el CP sale del tercer
  campo de `locality`.
