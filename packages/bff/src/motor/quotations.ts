import * as cheerio from 'cheerio';
import { MotorParseError } from './types.js';

/**
 * Parseo de la pantalla de resultados (`/embed/quotations/<s>`).
 *
 * El motor cotiza contra varias compañías en paralelo y devuelve resultados
 * parciales: el mismo endpoint se pide una y otra vez y cada respuesta trae
 * más planes que la anterior. No hay campo que diga "terminé" — lo que indica
 * que una cobertura sigue cargando es un spinner dentro de su acordeón.
 */

/** Importe en pesos. Se guarda en centavos para no arrastrar floats. */
export interface Money {
  readonly cents: number;
  /** Tal como lo muestra el motor, ej. "$83.628". */
  readonly formatted: string;
}

/** Un plan de una compañía dentro de una cobertura. */
export interface Quote {
  /**
   * Código del plan en el motor. Junto a company y plan identifica la elección.
   *
   * Es un string opaco y hay que conservarlo tal cual: San Cristóbal usa
   * códigos como `CA7_CPlus` y Meridional los escribe con cero a la izquierda
   * (`01`), que colisionaría con el `1` de Sancor si alguien lo pasa a número.
   */
  readonly code: string;
  readonly company: string;
  readonly companyLogoUrl?: string;
  readonly plan: string;
  readonly price: Money;
  readonly insuredAmount?: Money;
  /** Coberturas incluidas, tal como las lista el motor. */
  readonly features: readonly string[];
}

/** Una cobertura y los planes que ofrecen las compañías para ella. */
export interface CoverageGroup {
  readonly id: string;
  readonly name: string;
  /**
   * Cuántos planes declara el encabezado, ej. "Todo Riesgo (10)".
   * Es lo que el motor tiene hasta ahora, no lo que espera recibir.
   */
  readonly declaredCount: number;
  readonly quotes: readonly Quote[];
  /** La cobertura muestra spinner: todavía no llegó ninguna compañía. */
  readonly awaitingResults: boolean;
}

export interface Quotations {
  readonly groups: readonly CoverageGroup[];
  readonly total: number;
  /**
   * Ninguna compañía respondió todavía para alguna cobertura.
   *
   * Deliberadamente no hay un campo `pending`: el motor no dice nunca que
   * terminó. Los spinners desaparecen apenas llega el primer resultado, y el
   * conteo del encabezado refleja lo recibido, no lo esperado. El front htmx
   * original pollea cada 2 s indefinidamente. Decidir cuándo cortar es
   * responsabilidad de quien pollea — ver `pollQuotations`.
   */
  readonly awaitingFirstResults: boolean;
}

const SEL = {
  group: '.quotation-coverage-accordion',
  groupCheckbox: 'input.accordion-item-checkbox',
  groupHeader: 'label.insurance-header2',
  groupLoader: '.loading-section',
  card: '.plan-card-wrapper',
  logo: '.company-logo img',
  amount: '.amount2',
  features: '.features-list li',
  contract: 'a[hx-post*="step4_1"]',
} as const;

/**
 * Convierte un importe argentino a centavos.
 *
 * El motor escribe "$83.628" (punto de miles) y puede traer decimales con
 * coma. Interpretar mal el separador da un precio mil veces mayor, así que
 * ante un formato inesperado se falla en vez de adivinar.
 */
export function parseMoney(raw: string, context: string): Money {
  const formatted = raw.replace(/\s+/g, ' ').trim();
  const digits = formatted.replace(/[^\d.,]/g, '');
  if (digits === '') {
    throw new MotorParseError(`no se pudo leer el importe de ${context}`, {
      selector: SEL.amount,
      html: formatted,
    });
  }

  const [integerPart, decimalPart = ''] = digits.split(',');
  const pesos = Number.parseInt((integerPart ?? '').replace(/\./g, ''), 10);
  if (!Number.isFinite(pesos)) {
    throw new MotorParseError(`importe con formato inesperado en ${context}`, {
      selector: SEL.amount,
      html: formatted,
    });
  }
  const cents = Number.parseInt(decimalPart.padEnd(2, '0').slice(0, 2) || '0', 10);
  return { cents: pesos * 100 + cents, formatted };
}

/** Lee `hx-vals` del botón Contratar: es la elección que recibe la etapa 3. */
function parseChoice(
  $: cheerio.CheerioAPI,
  $card: cheerio.Cheerio<any>,
): { code: string; insurance: string; plan: string } {
  const raw = $card.find(SEL.contract).first().attr('hx-vals');
  if (raw === undefined) {
    throw new MotorParseError('una tarjeta de cotización no tiene botón de contratar', {
      selector: SEL.contract,
    });
  }
  let vals: Record<string, unknown>;
  try {
    vals = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new MotorParseError('hx-vals del botón de contratar no es JSON', {
      selector: SEL.contract,
      html: raw.slice(0, 200),
    });
  }
  const { code, insurance, insurance_plan: plan } = vals;
  if (typeof code !== 'string' || typeof insurance !== 'string' || typeof plan !== 'string') {
    throw new MotorParseError('hx-vals no trae code, insurance e insurance_plan', {
      selector: SEL.contract,
      html: raw.slice(0, 200),
    });
  }
  return { code, insurance, plan };
}

/** Traduce la pantalla de resultados, completa o a medio llegar. */
export function parseQuotations(html: string): Quotations {
  const $ = cheerio.load(html);
  const $groups = $(SEL.group);

  if ($groups.length === 0) {
    throw new MotorParseError('la pantalla de resultados no tiene coberturas', {
      selector: SEL.group,
      html: html.slice(0, 400),
    });
  }

  const groups: CoverageGroup[] = [];

  $groups.each((_, groupEl) => {
    const $group = $(groupEl);
    const headerText = $group.find(SEL.groupHeader).first().text().replace(/\s+/g, ' ').trim();
    // "Todo Riesgo (10)" → nombre y cantidad declarada.
    const match = /^(.*?)\s*\((\d+)\)$/.exec(headerText);
    if (match === null) {
      throw new MotorParseError(`encabezado de cobertura inesperado: "${headerText}"`, {
        selector: SEL.groupHeader,
      });
    }
    const [, name = '', count = '0'] = match;

    const quotes: Quote[] = [];
    $group.find(SEL.card).each((__, cardEl) => {
      const $card = $(cardEl);
      const { code, insurance, plan } = parseChoice($, $card);

      // La primera cifra es el precio; la segunda, si está, la suma asegurada.
      const amounts = $card
        .find(SEL.amount)
        .map((___, el) => $(el).text())
        .get();
      const [priceRaw, insuredRaw] = amounts;
      if (priceRaw === undefined) {
        throw new MotorParseError(`la cotización ${insurance}/${code} no tiene precio`, {
          selector: SEL.amount,
        });
      }

      const $logo = $card.find(SEL.logo).first();
      const logoUrl = $logo.attr('src');
      const features = $card
        .find(SEL.features)
        .map((___, el) => $(el).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter((f) => f !== '');

      quotes.push({
        code,
        company: $logo.attr('alt')?.trim() || insurance,
        ...(logoUrl !== undefined ? { companyLogoUrl: logoUrl } : {}),
        plan,
        price: parseMoney(priceRaw, `${insurance}/${code}`),
        ...(insuredRaw !== undefined
          ? { insuredAmount: parseMoney(insuredRaw, `${insurance}/${code} suma asegurada`) }
          : {}),
        features,
      });
    });

    groups.push({
      id: $group.find(SEL.groupCheckbox).first().attr('id')?.replace(/^acc-/, '') ?? name,
      name,
      declaredCount: Number.parseInt(count, 10),
      quotes,
      // Sólo indica que esta cobertura está vacía y esperando; desaparece con
      // el primer resultado aunque falten compañías por responder.
      awaitingResults: $group.find(SEL.groupLoader).length > 0,
    });
  });

  return {
    groups,
    total: groups.reduce((n, g) => n + g.quotes.length, 0),
    awaitingFirstResults: groups.some((g) => g.awaitingResults),
  };
}
