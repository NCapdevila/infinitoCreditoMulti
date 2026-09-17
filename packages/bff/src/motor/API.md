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

### Cotizar con patente: `2cp`

Con patente el motor resuelve el auto solo y **no hay pasos de marca, modelo,
año ni versión**: de `2cp` se sigue derecho a provincia. Por eso `2cp` es el
único lugar donde dice qué auto encontró, y hay que guardarlo ahí —después no
vuelve a estar en ningún lado y la contratación arranca sin vehículo—.

Lo que trae, y nada más que eso:

```html
<img alt="FIAT" class="brand-logo">              <!-- la marca, limpia -->
<h2 class="vehicle-title-cp">FIAT PALIO S 1.3 MPI (3 P) 2000</h2>
<p class="vehicle-description-cp">Tipo: SEDAN 3 PUERTAS</p>
<p class="vehicle-description-cp">Fabricante: FIAT AUTO ARGENTINA S.A.</p>
```

**No consulta motor ni chasis.** Esos los carga el vendedor en la contratación,
no hay de dónde sacarlos. El logo es además lo que separa el caso exitoso del
fallido: cuando no encuentra el auto, la tarjeta trae la patente y un aviso de
error, sin marca.

El botón que confirma es el único control del motor que no declara su destino:
`<a href="#" onclick="checkCarAge(2000)">`, y un script inline decide según la
antigüedad. Hasta veinte años sigue a `2_1` por GET; más viejo, **postea** a
`/embed/step5sp/…` —«Anterior al año 2006», una pantalla sin salida más que el
WhatsApp del asesor—. Pedir `?step=5sp` por GET devuelve esa pantalla sin el año
y sin el botón de contacto, así que el método importa.

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

**Y a veces devuelve la pantalla sin una sola cobertura**, de dos formas
distintas, las dos con 200:

| Plantilla | Cuándo | Qué trae |
|---|---|---|
| `quotations_results_coverage_detail.html` | sesión que el motor no tiene todavía | `#quotations-container` con "Procesando cotizaciones de seguros…" |
| `quotations_results_coverage_accordion.html` | la de siempre, con el listado vacío | `.locations-section2` sin acordeones adentro |

No son un cambio de markup: es la misma pantalla antes de que haya algo que
mostrar. `parseQuotations` las devuelve como una foto en cero
(`awaitingFirstResults`), porque el front corta el polling ante el primer
error y una de estas en la primera vuelta mataba la cotización entera.

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

- **El BFF no manda ningún token de captcha** y hoy el motor no se lo pide. Si
  eso cambia, los pasos empiezan a fallar y hay que sumarlo al cliente.
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
