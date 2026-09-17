import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import {
  MotorParseError,
  type OptionsSource,
  type Action,
  type ChoiceOption,
  type ChoiceStep,
  type MotorSession,
  type ParsedStep,
  type Step,
  type StepId,
  type Submit,
  type TextInputStep,
  type VehiculoDelMotor,
} from './types.js';

/**
 * Traduce un fragmento del motor htmx al modelo normalizado.
 *
 * Todo el conocimiento del markup vive en este archivo. Si el motor cambia,
 * este es el único lugar a tocar — de ahí que los selectores estén declarados
 * juntos arriba en vez de dispersos por el código.
 */

/** Selectores del motor, en un solo lugar para que un cambio sea una edición y no una cacería. */
const SEL = {
  eyebrow: '.tag',
  title: 'h1.title',
  description: '.description',
  /** Aclaración breve: «*Influye en el precio». */
  nota: '.info-tag',
  form: 'form',
  csrf: 'input[name="csrfmiddlewaretoken"]',
  next: 'input[name="next"]',
  /**
   * Los campos del paso. El motor usa `text`, `date` y `email` según el dato.
   * Se excluye el buscador de los listados, que también es un input de texto
   * pero no es lo que el paso pide.
   */
  textInput:
    'input[type="text"]:not(.search-input):not([name="search"]), input[type="date"], input[type="email"], input[type="tel"], input[type="number"]',
  radio: 'input[type="radio"]',
  radioLabel: 'label',
  radioIcon: 'img',
  searchBox: 'input.search-input, input[oninput]',
  /** Filas de los listados que sirven los endpoints de catálogo. */
  listItem: 'label.location-item',
  listItemName: '.location-name',
  primaryAction: '.primary-button',
  secondaryAction: '.secondary-button-step1, .secondary-button',
  /** El contenedor de acciones puede traer links planos, sin htmx. */
  actionLink: '.actions-section a[href]',
  /** Cuerpo de las pantallas informativas: el resultado de la consulta. */
  detalle: '.vehicle-card-cp h2, .vehicle-card-cp p, .vehicle-card-cp span',
  /**
   * El auto que encontró la consulta por patente.
   *
   * El logo está sólo cuando la consulta dio con algo: cuando falla, la tarjeta
   * trae la patente y el aviso de error, sin marca. Por eso es el que decide si
   * hay vehículo que guardar.
   */
  vehiculoMarca: '.vehicle-card-cp img.brand-logo',
  vehiculoTitulo: '.vehicle-card-cp .vehicle-title-cp',
  /**
   * El botón de confirmar el vehículo, que no declara a dónde va.
   *
   * Es un `<a href="#">` con `onclick="checkCarAge(<año>)"`: el destino lo
   * decide una función inline según la antigüedad del auto. Ver
   * `parseConfirmacion`.
   */
  confirmacion: '[onclick^="checkCarAge"]',
  /** Salida fuera del motor: el WhatsApp del asesor. */
  contacto: '.actions-section a[href^="http"]',
} as const;

/**
 * Extrae el `step` de una URL del motor.
 *
 * Casi siempre viaja en el query (`?step=2_1`), pero las salidas que el motor
 * postea lo llevan en el path: `/embed/step5sp/infinitocredito/<uuid>`, la
 * misma forma que usa `/embed/step4_1/…` al elegir un plan.
 */
function stepFromUrl(url: string): StepId | undefined {
  const enQuery = new URLSearchParams(url.split('?')[1] ?? '').get('step');
  if (enQuery !== null && enQuery !== '') return enQuery;
  return /\/embed\/step([^/?#]+)/.exec(url)?.[1];
}

/** Extrae el token de sesión `s` del query string de una URL de htmx. */
function sessionFromUrl(url: string): string | undefined {
  return new URLSearchParams(url.split('?')[1] ?? '').get('s') ?? undefined;
}

function text($el: cheerio.Cheerio<any>): string {
  // El motor parte los títulos con <br> («¿Cuál es tu fecha<br/>de nacimiento?»).
  // Sin convertirlos en espacio, las palabras quedan pegadas.
  const copia = $el.clone();
  copia.find('br').replaceWith(' ');
  return copia.text().replace(/\s+/g, ' ').trim();
}

/** Lee un atributo obligatorio o falla con contexto. */
function must(value: string | undefined, what: string, selector: string, step?: StepId): string {
  if (value === undefined || value === '') {
    throw new MotorParseError(`no se encontró ${what}`, { step, selector });
  }
  return value;
}

/**
 * Reconstruye la sesión desde el fragmento.
 *
 * El CSRF rota en cada respuesta, así que hay que releerlo siempre: reusar el
 * anterior hace que el motor rechace el POST siguiente.
 */
export function parseSession(
  $: CheerioAPI,
  uuid: string,
  step?: StepId,
  previa?: MotorSession,
): MotorSession {
  // La pantalla de espera no trae formulario ni CSRF nuevo: se conserva el
  // anterior, que sigue siendo válido para pedir resultados.
  const sinFormulario = $(`${SEL.form}[hx-post]`).length === 0;
  const csrf = sinFormulario
    ? ($(SEL.csrf).first().attr('value') ?? previa?.csrf ?? '')
    : must($(SEL.csrf).first().attr('value'), 'el token CSRF', SEL.csrf, step);
  const anyHxUrl =
    $('[hx-post]').first().attr('hx-post') ?? $('[hx-get]').first().attr('hx-get') ?? '';
  // Las pantallas sin salida —«Anterior al año 2006»— no traen una sola URL del
  // motor: ni formulario, ni htmx, ni links con `s`. La sesión no cambió, sólo
  // no viene repetida en el fragmento, así que se conserva la de quien pidió el
  // paso. Sin esto, llegar ahí es un 502 en vez de una pantalla.
  const s = must(
    sessionFromUrl(anyHxUrl) ?? previa?.s,
    'el token de sesión `s`',
    '[hx-post] | [hx-get]',
    step,
  );
  return { uuid, s, csrf };
}

/**
 * Resuelve a qué paso apunta un control.
 *
 * El motor mezcla tres formas de navegar: `hx-post` (postea el form),
 * `hx-get` (trae otro fragmento) y `<a href="?step=…">` plano. Las tres
 * llevan el step en el query string.
 */
function targetOf($el: cheerio.Cheerio<any>): { url: string; method: 'GET' | 'POST' } | undefined {
  const post = $el.attr('hx-post');
  if (post !== undefined) return { url: post, method: 'POST' };
  const get = $el.attr('hx-get');
  if (get !== undefined) return { url: get, method: 'GET' };
  const href = $el.attr('href');
  if (href !== undefined && href !== '#') return { url: href, method: 'GET' };
  return undefined;
}

/**
 * Lee cómo se completa el paso.
 *
 * El submit es el POST del form: en el paso de patente lo dispara el botón
 * primario, y en los de lista el propio radio (htmx postea on-change). Un
 * control con destino propio — `hx-get` o `href` — nunca es el submit, por
 * más que tenga clase de botón primario: es una salida alternativa.
 */
function parseSubmit($: CheerioAPI, step: StepId | undefined): Submit {
  const $form = $(SEL.form).first();
  const formPost = $form.attr('hx-post');
  if (formPost === undefined) {
    throw new MotorParseError('el paso no tiene formulario que postear', {
      step,
      selector: `${SEL.form}[hx-post]`,
    });
  }

  const nextValue = $(SEL.next).first().attr('value');
  // Sólo es el rótulo del submit si el botón no navega por su cuenta.
  const $primary = $(SEL.primaryAction).first();
  const label =
    $primary.length > 0 && targetOf($primary)?.method !== 'GET' ? text($primary) : undefined;

  return {
    method: 'POST',
    step: must(stepFromUrl(formPost), 'el step del formulario', SEL.form, step),
    ...(label !== undefined && label !== '' ? { label } : {}),
    ...(nextValue !== undefined ? { next: nextValue } : {}),
  };
}

/** Lee las salidas alternativas: las que llevan a otro paso sin completar este. */
function parseActions($: CheerioAPI, step: StepId | undefined): Action[] {
  const actions: Action[] = [];
  const seen = new Set<string>();

  const collect = (el: any) => {
    const $el = $(el);
    const target = targetOf($el);
    // Un control que postea el form es el submit, no una salida alternativa.
    if (target === undefined || target.method === 'POST') return;

    const label = text($el);
    const stepId = stepFromUrl(target.url);
    if (label === '' || stepId === undefined) return;

    const key = `${label}|${stepId}`;
    if (seen.has(key)) return;
    seen.add(key);

    actions.push({ label, method: target.method, step: stepId });
  };

  $(SEL.secondaryAction).each((_, el) => collect(el));
  $(SEL.primaryAction).each((_, el) => collect(el));
  $(SEL.actionLink).each((_, el) => collect(el));

  return actions;
}

/**
 * El botón «Sí, continuemos» de la pantalla del vehículo.
 *
 * Es el único control del motor que no dice a dónde va: un `<a href="#">` con
 * `onclick="checkCarAge(2000)"`. El destino lo decide un script inline según la
 * antigüedad del auto —el camino normal, o la pantalla que avisa que un auto de
 * más de veinte años no se cotiza por acá—.
 *
 * De ahí que haya que leer el script. La alternativa era clavar de este lado
 * los dos destinos y el límite de años, y el día que el motor moviera el
 * límite seguiríamos mandando autos viejos al camino normal sin que nada
 * fallara.
 */
function parseConfirmacion($: CheerioAPI, step: StepId | undefined): Action | undefined {
  const $boton = $(SEL.confirmacion).first();
  if ($boton.length === 0) return undefined;

  const label = text($boton);
  const onclick = $boton.attr('onclick') ?? '';
  const anio = Number(/checkCarAge\(\s*(\d{4})\s*\)/.exec(onclick)?.[1]);
  const script =
    $('script')
      .toArray()
      .map((el) => $(el).html() ?? '')
      .find((cuerpo) => cuerpo.includes('function checkCarAge')) ?? '';
  // «vehicleYear <= (currentYear - 20)»: cuántos años son «viejo» lo dice el motor.
  const antiguedad = Number(/currentYear\s*-\s*(\d+)/.exec(script)?.[1]);
  // Las dos ramas, en el orden en que el script las escribe: primero la del
  // auto viejo, después la del camino normal.
  const ramas = [...script.matchAll(/htmx\.ajax\(\s*'(GET|POST)'\s*,\s*'([^']+)'/g)];

  const rama = ramas[anio <= new Date().getFullYear() - antiguedad ? 0 : 1];
  const destino = rama === undefined ? undefined : stepFromUrl(rama[2] ?? '');
  if (label === '' || !Number.isFinite(anio) || !Number.isFinite(antiguedad) || destino === undefined) {
    throw new MotorParseError('el botón de confirmar el vehículo ya no dice a dónde va', {
      step,
      selector: SEL.confirmacion,
      html: `${onclick} ${script.slice(0, 300)}`,
    });
  }

  return { label, method: rama?.[1] === 'POST' ? 'POST' : 'GET', step: destino };
}

/**
 * El vehículo que el motor encontró por patente.
 *
 * Es el único lugar donde dice qué auto es: con patente se saltea los pasos de
 * marca, modelo, año y versión, así que lo que no se lea acá no se lee en
 * ningún lado.
 *
 * El título viene armado —«FIAT PALIO S 1.3 MPI (3 P) 2000»— y se le sacan las
 * dos puntas: la marca, que viene limpia en el `alt` del logo, y el año, que es
 * el grupo de cuatro dígitos del final. Las dos tienen campo propio en la
 * constancia y al lado se verían repetidas. Si alguna punta no está donde se la
 * espera, se deja el título entero: de más es mejor que de menos.
 */
function parseVehiculo($: CheerioAPI): VehiculoDelMotor | undefined {
  const marca = $(SEL.vehiculoMarca).first().attr('alt')?.trim() ?? '';
  const titulo = text($(SEL.vehiculoTitulo).first());
  if (marca === '' || titulo === '') return undefined;

  const anio = Number(/\b(\d{4})\s*$/.exec(titulo)?.[1]);
  const conMarca = titulo.toUpperCase().startsWith(`${marca.toUpperCase()} `);
  const descripcion = (conMarca ? titulo.slice(marca.length + 1) : titulo)
    .replace(/\s*\b\d{4}\s*$/, '')
    .trim();

  return {
    marca: marca.toUpperCase(),
    descripcion: descripcion === '' ? titulo : descripcion,
    anio: Number.isFinite(anio) ? anio : 0,
  };
}

/**
 * La salida que se va del motor: el WhatsApp del asesor.
 *
 * Aparece donde la pantalla no tiene ninguna salida propia, y ahí es lo único
 * que se puede hacer. Se toma el enlace entero —número y mensaje—: es del
 * motor, no nuestro, y tenerlo repetido de los dos lados es tenerlo mal de uno.
 */
function parseContacto($: CheerioAPI): { label: string; url: string } | undefined {
  const $link = $(SEL.contacto).first();
  const url = $link.attr('href');
  const label = text($link);
  return url === undefined || label === '' ? undefined : { label, url };
}

/**
 * Vuelve absoluta una URL del motor.
 *
 * Los logos de marca llegan como `/static/assets/…`, relativos al motor. Si se
 * pasan tal cual al front, el navegador los busca en el origen de la app y no
 * los encuentra: las marcas se ven sin logo.
 */
function urlAbsoluta(src: string | undefined, baseUrl: string | undefined): string | undefined {
  if (src === undefined || src === '') return undefined;
  if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) return src;
  if (baseUrl === undefined) return src;
  return `${baseUrl.replace(/\/$/, '')}${src.startsWith('/') ? '' : '/'}${src}`;
}

/** Lee las opciones de un paso de selección (radios con label). */
function parseOptions(
  $: CheerioAPI,
  step: StepId | undefined,
  baseUrl: string | undefined,
): ChoiceOption[] {
  const options: ChoiceOption[] = [];

  $(SEL.radio).each((_, el) => {
    const $radio = $(el);
    const id = $radio.attr('id');
    const value = $radio.attr('value');
    if (value === undefined) return;

    // El label puede envolver al radio o referenciarlo por `for`.
    const $label = id !== undefined
      ? $(`label[for="${id}"]`).first().add($radio.nextAll(SEL.radioLabel).first())
      : $radio.nextAll(SEL.radioLabel).first();

    const iconUrl = urlAbsoluta($label.find(SEL.radioIcon).first().attr('src'), baseUrl);
    // Si el label es puramente gráfico, el value es el mejor rótulo disponible.
    const label = text($label) || value;

    options.push({ value, label, ...(iconUrl !== undefined ? { iconUrl } : {}) });
  });

  if (options.length === 0) {
    throw new MotorParseError('el paso parece de selección pero no tiene opciones', {
      step,
      selector: SEL.radio,
    });
  }
  return options;
}

/**
 * Lee de dónde pedir las opciones de un paso con buscador.
 *
 * El motor lo declara en el propio input de búsqueda: `hx-post` apunta al
 * endpoint de catálogo y `hx-trigger="load"` hace que se pida al montar.
 */
function parseOptionsSource($: CheerioAPI): OptionsSource | undefined {
  const url = $(SEL.searchBox).first().attr('hx-post');
  if (url === undefined) return undefined;
  const path = url.split('?')[0];
  return path === undefined || path === '' ? undefined : { path };
}

/**
 * Qué campo postea cada catálogo.
 *
 * El motor no lo dice en el fragmento del paso —el input visible se llama
 * `search`—, así que se deduce del endpoint, que es lo único estable.
 */
function nombreDelCampo(path: string): string | undefined {
  const porEndpoint: Record<string, string> = {
    '/embed/models': 'model',
    '/embed/versions': 'version',
    '/embed/provinces': 'province',
    '/embed/localities': 'locality',
  };
  return porEndpoint[path];
}

/**
 * Traduce la respuesta de un endpoint de catálogo.
 *
 * Son listas planas de `label.location-item`: un radio con el valor y un span
 * con el texto visible. El valor viene compuesto con `|`
 * (`AGRONOMÍA|319|1431`) y se conserva tal cual: el motor espera recibirlo así.
 */
export function parseOptionList(html: string, baseUrl?: string): ChoiceOption[] {
  const $ = cheerio.load(html);
  const options: ChoiceOption[] = [];

  $(SEL.listItem).each((_, el) => {
    const $item = $(el);
    const value = $item.find(SEL.radio).first().attr('value');
    if (value === undefined) return;
    const label = text($item.find(SEL.listItemName).first()) || value;
    options.push({ value, label });
  });

  return options;
}

/**
 * Traduce un fragmento del motor a un paso normalizado.
 *
 * @param html  fragmento devuelto por /embed/partial/… o la página completa
 * @param uuid  UUID del embed
 * @param stepId  id del paso pedido, sólo para mensajes de error
 * @param baseUrl  origen del motor, para absolutizar los logos
 * @param sesionPrevia  la sesión con la que se pidió el paso, para las
 *   pantallas que no la repiten en el fragmento
 */
export function parseStep(
  html: string,
  uuid: string,
  stepId?: StepId,
  baseUrl?: string,
  sesionPrevia?: MotorSession,
): ParsedStep {
  const $ = cheerio.load(html);
  const session = parseSession($, uuid, stepId, sesionPrevia);

  const title = text($(SEL.title).first());
  if (title === '') {
    throw new MotorParseError('no se encontró el título del paso', {
      step: stepId,
      selector: SEL.title,
      html: html.slice(0, 400),
    });
  }

  const eyebrow = text($(SEL.eyebrow).first()) || undefined;
  const description = text($(SEL.description).first()) || undefined;
  const nota = text($(SEL.nota).first()) || undefined;
  // Sin formulario no hay nada que completar. Puede ser una pantalla que
  // informa y ofrece seguir, o la de espera mientras cotizan las compañías: lo
  // que las separa es si hay a dónde ir.
  if ($(`${SEL.form}[hx-post]`).length === 0) {
    // El botón de confirmar va primero: es el «sí» a la pregunta del título, y
    // el orden de la pantalla lo da eso, no el orden en que el markup escribe
    // los controles —que pone la salida secundaria antes—.
    const confirmacion = parseConfirmacion($, stepId);
    const salidas = parseActions($, stepId);
    const acciones = confirmacion === undefined ? salidas : [confirmacion, ...salidas];
    const contacto = parseContacto($);

    if (acciones.length > 0 || contacto !== undefined) {
      const detalle = $(SEL.detalle)
        .map((_, el) => text($(el)))
        .get()
        .filter((linea) => linea !== '');
      const vehiculo = parseVehiculo($);

      const step: Step = {
        kind: 'info',
        // El destino de su acción no es su identidad: usarlo haría que este
        // paso y el siguiente compartan id, y el front los trate como el mismo.
        id: stepId ?? 'info',
        title,
        detalle,
        actions: acciones,
        ...(vehiculo !== undefined ? { vehiculo } : {}),
        ...(eyebrow !== undefined ? { eyebrow } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(contacto !== undefined ? { contacto } : {}),
      };
      return { session, step };
    }

    const step: Step = {
      kind: 'waiting',
      id: stepId ?? 'espera',
      title,
      ...(description !== undefined ? { description } : {}),
    };
    return { session, step };
  }

  const submit = parseSubmit($, stepId);
  const actions = parseActions($, stepId);
  const id = stepId ?? submit.step;

  const base = {
    id,
    title,
    submit,
    actions,
    ...(eyebrow !== undefined ? { eyebrow } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(nota !== undefined ? { nota } : {}),
  };

  // Un paso pide datos escritos o una elección de lista; nunca las dos cosas.
  const $campos = $(SEL.textInput);
  if ($campos.length > 0) {
    const fields = $campos
      .map((_, el) => {
        const $campo = $(el);
        const maxLength = Number.parseInt($campo.attr('maxlength') ?? '', 10);
        return {
          name: must($campo.attr('name'), 'el nombre de un campo', SEL.textInput, stepId),
          type: $campo.attr('type') ?? 'text',
          ...($campo.attr('aria-label') !== undefined
            ? { label: $campo.attr('aria-label') }
            : {}),
          ...($campo.attr('placeholder') !== undefined
            ? { placeholder: $campo.attr('placeholder') }
            : {}),
          ...(Number.isFinite(maxLength) ? { maxLength } : {}),
          ...($campo.attr('value') !== undefined ? { value: $campo.attr('value') } : {}),
        };
      })
      .get();

    const step: TextInputStep = { ...base, kind: 'text-input', fields };
    return { session, step };
  }

  const $radio = $(SEL.radio).first();
  if ($radio.length > 0) {
    const step: ChoiceStep = {
      ...base,
      kind: 'choice',
      name: must($radio.attr('name'), 'el nombre del campo de selección', SEL.radio, stepId),
      options: parseOptions($, stepId, baseUrl),
      searchable: $(SEL.searchBox).length > 0,
    };
    return { session, step };
  }

  // Paso con buscador: llega sin opciones y con la ruta para pedirlas.
  const source = parseOptionsSource($);
  if (source !== undefined) {
    const step: ChoiceStep = {
      ...base,
      kind: 'choice',
      // El campo a postear es el del form, no el del buscador (que es `search`).
      name: must(
        nombreDelCampo(source.path),
        'el campo del paso de selección',
        SEL.searchBox,
        stepId,
      ),
      options: [],
      optionsSource: source,
      searchable: true,
    };
    return { session, step };
  }

  throw new MotorParseError('no se reconoce la forma del paso', {
    step: stepId,
    html: html.slice(0, 400),
  });
}

export type { Step, ParsedStep };
