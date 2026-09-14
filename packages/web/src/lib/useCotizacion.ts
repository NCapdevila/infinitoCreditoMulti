import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChoiceOption } from '@infinito/bff/motor/types';
import type { Quotations, Quote } from '@infinito/bff/motor/quotations';
import { api, ErrorDeApi, type EstadoCotizacion } from './api.ts';

/**
 * Estado de la cotización contra el BFF.
 *
 * Concentra todo lo que el motor impone y que las pantallas no deberían
 * cargar: pedir las listas de los pasos con buscador, sostener el polling de
 * resultados y decidir cuándo dejar de pedir —porque el motor nunca avisa que
 * terminó.
 */

/** Cada cuánto se pide el estado de la cotización. El multi usa lo mismo. */
const INTERVALO_MS = 2_000;
/**
 * Vueltas sin cambios para dar la cotización por completa.
 *
 * El motor responde por olas y entre una y otra llega a pasar 6 s: en el
 * tráfico observado, el total se quedó quieto 3 vueltas seguidas y después
 * saltó de 15 a 27 planes. Con un umbral de 3 se cortaría justo ahí, perdiendo
 * casi la mitad de las ofertas, así que se espera 5 vueltas (10 s).
 */
const VUELTAS_ESTABLES = 5;
/** Tope duro: una cotización real tardó ~30 s. */
const TIMEOUT_MS = 60_000;

export interface Cotizacion {
  readonly estado: EstadoCotizacion | null;
  readonly opciones: readonly ChoiceOption[] | undefined;
  readonly resultados: Quotations | null;
  /**
   * El polling sigue en curso: van a llegar más planes.
   *
   * No se puede deducir de los resultados —los spinners del motor desaparecen
   * con el primer plan aunque falten compañías—, así que lo sabe quien pollea.
   */
  readonly buscandoMas: boolean;
  readonly cargando: boolean;
  readonly enviando: boolean;
  readonly error: string | null;
  readonly historial: readonly string[];
  avanzar: (valores: Record<string, string>) => Promise<void>;
  ir: (step: string) => Promise<void>;
  elegir: (quote: Quote) => Promise<Record<string, string>>;
  reintentar: () => void;
}

export function useCotizacion(): Cotizacion {
  const [estado, setEstado] = useState<EstadoCotizacion | null>(null);
  const [opciones, setOpciones] = useState<readonly ChoiceOption[] | undefined>(undefined);
  const [resultados, setResultados] = useState<Quotations | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [buscandoMas, setBuscandoMas] = useState(false);
  /** Ids de paso ya visitados, para saber si se puede volver. */
  const [historial, setHistorial] = useState<readonly string[]>([]);

  const mensajeDe = (e: unknown) =>
    e instanceof ErrorDeApi ? e.message : 'No pudimos conectarnos. Probá de nuevo.';

  // Arranca una cotización al montar.
  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    api
      .crear()
      .then((nuevo) => {
        if (!vigente) return;
        setEstado(nuevo);
        setHistorial([nuevo.paso.id]);
      })
      .catch((e: unknown) => vigente && setError(mensajeDe(e)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [intento]);

  // Los pasos con buscador llegan vacíos: la lista se pide aparte.
  const id = estado?.id;
  const paso = estado?.paso;
  useEffect(() => {
    if (id === undefined || paso === undefined) return;
    if (paso.kind !== 'choice' || paso.optionsSource === undefined) {
      setOpciones(undefined);
      return;
    }

    let vigente = true;
    setOpciones(undefined);
    api
      .opciones(id)
      .then((lista) => vigente && setOpciones(lista))
      .catch((e: unknown) => vigente && setError(mensajeDe(e)));
    return () => {
      vigente = false;
    };
  }, [id, paso]);

  /**
   * Polling de resultados.
   *
   * Corta cuando el total deja de moverse durante unas vueltas, o al llegar al
   * tope de tiempo. El front sigue mostrando lo que haya en cualquier caso.
   */
  const cotizando = estado?.cotizando === true;
  const timeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (id === undefined || !cotizando) return;

    let vigente = true;
    const empezo = Date.now();
    let previo = -1;
    let estables = 0;
    setBuscandoMas(true);

    const pedir = async () => {
      if (!vigente) return;
      try {
        const foto = await api.resultados(id);
        if (!vigente) return;
        setResultados(foto);

        estables = foto.total === previo ? estables + 1 : 0;
        previo = foto.total;

        const listo = estables >= VUELTAS_ESTABLES && foto.total > 0;
        const vencido = Date.now() - empezo > TIMEOUT_MS;
        if (listo || vencido) {
          setBuscandoMas(false);
          return;
        }

        timeoutRef.current = window.setTimeout(() => void pedir(), INTERVALO_MS);
      } catch (e: unknown) {
        if (vigente) {
          setError(mensajeDe(e));
          setBuscandoMas(false);
        }
      }
    };

    void pedir();
    return () => {
      vigente = false;
      setBuscandoMas(false);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, [id, cotizando]);

  const avanzar = useCallback(
    async (valores: Record<string, string>) => {
      if (id === undefined) return;
      setEnviando(true);
      setError(null);
      try {
        const siguiente = await api.avanzar(id, valores);
        setEstado(siguiente);
        setHistorial((h) => [...h, siguiente.paso.id]);
      } catch (e: unknown) {
        setError(mensajeDe(e));
      } finally {
        setEnviando(false);
      }
    },
    [id],
  );

  const ir = useCallback(
    async (step: string) => {
      if (id === undefined) return;
      setEnviando(true);
      setError(null);
      try {
        const siguiente = await api.ir(id, step);
        setEstado(siguiente);
        setHistorial((h) => [...h, siguiente.paso.id]);
      } catch (e: unknown) {
        setError(mensajeDe(e));
      } finally {
        setEnviando(false);
      }
    },
    [id],
  );

  const elegir = useCallback(
    async (quote: Quote) => {
      if (id === undefined) return {};
      const { valores } = await api.elegir(id, quote);
      return valores;
    },
    [id],
  );

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  return {
    estado,
    opciones,
    resultados,
    buscandoMas,
    cargando,
    enviando,
    error,
    historial,
    avanzar,
    ir,
    elegir,
    reintentar,
  };
}
