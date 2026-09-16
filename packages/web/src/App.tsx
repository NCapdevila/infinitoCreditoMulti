import { useState } from 'react';
import type { Quote } from '@infinito/bff/motor/quotations';
import { useCotizacion } from './lib/useCotizacion.ts';
import { QBuscando } from './screens/cotizador/QBuscando.tsx';
import { QError } from './screens/cotizador/QError.tsx';
import { QResultados } from './screens/cotizador/QResultados.tsx';
import { QStepScreen } from './screens/cotizador/QStepScreen.tsx';
import { S01Cobertura } from './screens/S01Cobertura.tsx';
import { S02Agencia } from './screens/S02Agencia.tsx';
import { S03Requisitos } from './screens/S03Requisitos.tsx';
import { S04Asegurado } from './screens/S04Asegurado.tsx';
import { S05Complemento } from './screens/S05Complemento.tsx';
import { S06Domicilio } from './screens/S06Domicilio.tsx';
import { S07Vehiculo } from './screens/S07Vehiculo.tsx';
import { S07bCeroKm } from './screens/S07bCeroKm.tsx';
import { S08Fotos } from './screens/S08Fotos.tsx';
import { S09Checklist } from './screens/S09Checklist.tsx';
import { S10FotosCargadas } from './screens/S10FotosCargadas.tsx';
import { S11Pago } from './screens/S11Pago.tsx';
import { S12Resumen } from './screens/S12Resumen.tsx';
import { S13Emision } from './screens/S13Emision.tsx';
import { contratacionDeEjemplo, type Contratacion } from './lib/contratacion.ts';
import { descargarConstancia } from './lib/certificado.ts';
import { enviarSolicitud } from './lib/solicitud.ts';
import { abrirWhatsapp as abrirChat, mensajeDeCobertura } from './lib/whatsapp.ts';
import { irArriba } from './lib/scroll.ts';

/**
 * Flujo completo, tal como lo opera el vendedor: cotiza, elige cobertura y
 * contrata sin cambiar de aplicación.
 *
 * Dos etapas encadenadas:
 *   1. Cotización — la sirve el BFF traduciendo el motor htmx. El front no
 *      conoce los pasos: los recibe y los dibuja.
 *   2. Contratación (etapa 3) — S01…S13 de la spec funcional, en el front.
 *
 * Al elegir un plan, el BFF devuelve todo lo capturado durante la cotización y
 * con eso se arma la contratación: el titular, el CP y la localidad no se
 * vuelven a pedir.
 *
 * Pendiente: persistir el borrador de la etapa 3 (spec 7.10). Son trece pasos
 * y nueve cargas de archivo; el lugar natural es el BFF.
 */
type PantallaS =
  | 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06'
  | 'S07' | 'S07b' | 'S08' | 'S09' | 'S10' | 'S11' | 'S12' | 'S13';

/** Bloques del resumen que se pueden corregir sin recotizar. */
type DestinoEdicion = 'asegurado' | 'domicilio' | 'vehiculo' | 'pago' | 'fotos';

/** Camino principal. Las ramas (0 KM, verificación) se resuelven aparte. */
const ORDEN_S: readonly PantallaS[] = [
  'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12', 'S13',
];

export function App() {
  const cotizacion = useCotizacion();
  const [contratando, setContratando] = useState<PantallaS | null>(null);
  const [datos, setDatos] = useState<Contratacion>(contratacionDeEjemplo);
  const [descargando, setDescargando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  /** Id del correo: sin base de datos, es el comprobante de la operación. */
  const [referencia, setReferencia] = useState<string | null>(null);
  const [constanciaAlCliente, setConstanciaAlCliente] = useState<
    { enviada: boolean; error?: string } | undefined
  >(undefined);
  /** Una edición lanzada desde S12 vuelve al resumen, no sigue el camino. */
  const [volverAResumen, setVolverAResumen] = useState(false);

  const irA = (pantalla: PantallaS) => {
    setContratando(pantalla);
    irArriba();
  };

  // Durante la cotización todavía no hay cobertura elegida: se abre el chat sin
  // contexto. Desde la contratación en adelante, el mensaje lo lleva.
  const abrirWhatsapp = () =>
    contratando === null ? abrirChat() : abrirChat(mensajeDeCobertura(datos));

  /**
   * Pasa de cotización a contratación.
   *
   * Los valores vienen del BFF, que los fue guardando paso a paso. El CP sale
   * del tercer campo de `locality` (`AGRONOMÍA|310|1417`), que es de donde lo
   * toma el motor.
   */
  const contratar = async (quote: Quote) => {
    const valores = await cotizacion.elegir(quote);
    const [nombreLocalidad = '', , cp = ''] = (valores['locality'] ?? '').split('|');
    const telefono = [valores['phone_prefix'], valores['phone_area'], valores['phone_number']]
      .filter((parte) => parte !== undefined && parte !== '')
      .join(' ');

    setDatos((previo) => ({
      ...previo,
      cobertura: {
        code: quote.code,
        compania: quote.company,
        plan: quote.plan,
        costoMensual: quote.price.formatted,
        ...(quote.insuredAmount !== undefined
          ? { sumaAsegurada: quote.insuredAmount.formatted }
          : {}),
      },
      contacto: {
        nombre: valores['full_name'] ?? previo.contacto.nombre,
        email: valores['email'] ?? previo.contacto.email,
        telefono: telefono !== '' ? telefono : previo.contacto.telefono,
      },
      asegurado: {
        ...previo.asegurado,
        nombreCompleto: valores['full_name'] ?? previo.asegurado.nombreCompleto,
        email: valores['email'] ?? previo.asegurado.email,
        telefono: telefono !== '' ? telefono : previo.asegurado.telefono,
      },
      domicilio: {
        ...previo.domicilio,
        cp: cp !== '' ? cp : previo.domicilio.cp,
        localidad: nombreLocalidad !== '' ? nombreLocalidad : previo.domicilio.localidad,
      },
      vehiculo: {
        ...previo.vehiculo,
        marca: (valores['brand'] ?? previo.vehiculo.marca).toUpperCase(),
        // Los valores del motor vienen compuestos con «|»; el rótulo va primero.
        modelo: (valores['model'] ?? previo.vehiculo.modelo).split('|')[0] ?? '',
        version: (valores['version'] ?? previo.vehiculo.version).split('|')[0] ?? '',
        anio: Number.parseInt(valores['year'] ?? '', 10) || previo.vehiculo.anio,
      },
    }));
    irA('S01');
  };

  // ── Etapa 1–2: cotización ────────────────────────────────────────────
  if (contratando === null) {
    const { estado, error, cargando, resultados } = cotizacion;

    if (error !== null && estado === null) {
      return <QError mensaje={error} onReintentar={cotizacion.reintentar} />;
    }
    if (cargando || estado === null) {
      // Acá no hay ninguna cotización en curso: la app recién está pidiéndole el
      // primer paso al BFF. Decír que «estamos preparando tu cotización» antes de
      // que el vendedor cargue un solo dato promete algo que no está pasando.
      return <QBuscando titulo="Un momento" descripcion="Estamos cargando el cotizador." />;
    }

    if (estado.cotizando) {
      // Hasta que llegue el primer plan no hay nada que elegir.
      if (resultados === null || resultados.total === 0) {
        return <QBuscando onWhatsapp={abrirWhatsapp} />;
      }
      return (
        <QResultados
          resultados={resultados}
          buscandoMas={cotizacion.buscandoMas}
          onContratar={(quote) => void contratar(quote)}
          onWhatsapp={abrirWhatsapp}
        />
      );
    }

    return (
      <QStepScreen
        key={estado.paso.id}
        step={estado.paso}
        opciones={cotizacion.opciones}
        cargandoOpciones={
          estado.paso.kind === 'choice' &&
          estado.paso.optionsSource !== undefined &&
          cotizacion.opciones === undefined
        }
        enviando={cotizacion.enviando}
        error={error}
        onSubmit={(valores) => void cotizacion.avanzar(valores)}
        onAction={(step) => void cotizacion.ir(step)}
        // Sin handler el chevron no se dibuja: en el primer paso no hay a dónde
        // volver, igual que en el motor.
        {...(cotizacion.puedeVolver ? { onBack: () => void cotizacion.volver() } : {})}
      />
    );
  }

  // ── Etapa 3: contratación ────────────────────────────────────────────
  const pantalla = contratando;

  /** Avanza por el camino principal, o vuelve al resumen si venía de editar. */
  const avanzarS = () => {
    if (volverAResumen) {
      setVolverAResumen(false);
      irA('S12');
      return;
    }
    const siguiente = ORDEN_S[ORDEN_S.indexOf(pantalla) + 1];
    if (siguiente !== undefined) irA(siguiente);
  };

  const volverS = () => {
    const anterior = ORDEN_S[ORDEN_S.indexOf(pantalla) - 1];
    if (anterior !== undefined) irA(anterior);
  };

  /** Dónde se edita cada bloque del resumen. */
  const PANTALLA_DE: Record<DestinoEdicion, PantallaS> = {
    asegurado: 'S04',
    domicilio: 'S06',
    vehiculo: 'S07',
    fotos: 'S09',
    pago: 'S11',
  };

  const editarDesdeResumen = (destino: DestinoEdicion) => {
    setVolverAResumen(true);
    irA(PANTALLA_DE[destino]);
  };

  switch (pantalla) {
    case 'S01':
      return (
        <S01Cobertura
          datos={datos}
          onContratar={() => irA('S02')}
          onWhatsapp={abrirWhatsapp}
          // Volver a los resultados: la cotización sigue viva en el BFF.
          onBack={() => setContratando(null)}
        />
      );

    case 'S02':
    case 'S03':
      return (
        <>
          <S02Agencia
            valores={datos.agencia}
            onChange={(agencia) => setDatos({ ...datos, agencia })}
            onNext={() => irA('S03')}
            onBack={() => irA('S01')}
          />
          <S03Requisitos
            open={pantalla === 'S03'}
            onClose={() => irA('S02')}
            onNext={() => irA('S04')}
          />
        </>
      );

    case 'S04':
      return (
        <S04Asegurado
          valores={datos.asegurado}
          onChange={(asegurado) => setDatos({ ...datos, asegurado })}
          onNext={avanzarS}
          onBack={() => irA('S02')}
        />
      );

    case 'S05':
      return (
        <S05Complemento
          valores={datos.asegurado}
          onChange={(asegurado) => setDatos({ ...datos, asegurado })}
          onNext={avanzarS}
          onBack={volverS}
        />
      );

    case 'S06':
      return (
        <S06Domicilio
          valores={datos.domicilio}
          onChange={(domicilio) => setDatos({ ...datos, domicilio })}
          onNext={avanzarS}
          onBack={volverS}
        />
      );

    case 'S07':
      return (
        <S07Vehiculo
          valores={datos.vehiculo}
          onChange={(vehiculo) => setDatos({ ...datos, vehiculo })}
          onNext={avanzarS}
          onCeroKm={() => {
            setDatos({ ...datos, vehiculo: { ...datos.vehiculo, esCeroKm: true } });
            irA('S07b');
          }}
          onBack={volverS}
        />
      );

    case 'S07b':
      return (
        <S07bCeroKm
          nombreArchivo={datos.documentoNoRodamiento}
          onArchivo={(nombre) => setDatos({ ...datos, documentoNoRodamiento: nombre })}
          // El prototipo salta de acá al medio de pago, salteando las nueve
          // fotos. Es el bloqueante 7.3 de la spec: mientras no se decida, se
          // respeta lo que está diseñado.
          onNext={() => irA('S11')}
          onBack={() => {
            setDatos({ ...datos, vehiculo: { ...datos.vehiculo, esCeroKm: false } });
            irA('S07');
          }}
        />
      );

    case 'S08':
      return <S08Fotos onNext={() => irA('S09')} onBack={() => irA('S07')} />;

    case 'S09':
      return (
        <S09Checklist
          fotos={datos.fotos}
          onFoto={(foto) =>
            setDatos((previo) => ({
              ...previo,
              // Cada carga reemplaza sólo su toma; el prototipo tildaba las nueve.
              fotos: [...previo.fotos.filter((f) => f.tipo !== foto.tipo), foto],
            }))
          }
          onNext={avanzarS}
          onBack={() => irA('S08')}
        />
      );

    case 'S10':
      return (
        <S10FotosCargadas
          fotos={datos.fotos}
          onNext={avanzarS}
          onRehacer={() => {
            // «Volver a tomar fotos» descarta lo cargado, como en el prototipo.
            setDatos({ ...datos, fotos: [] });
            irA('S09');
          }}
          onBack={() => irA('S09')}
        />
      );

    case 'S11':
      return (
        <S11Pago
          valores={datos.medioDePago}
          onChange={(medioDePago) => setDatos({ ...datos, medioDePago })}
          onNext={avanzarS}
          onBack={() => irA(datos.vehiculo.esCeroKm ? 'S07b' : 'S10')}
        />
      );

    case 'S12':
      return (
          <S12Resumen
            datos={datos}
            enviando={enviando}
            errorEnvio={errorEnvio}
            // Confirmar manda la solicitud: el correo es el único registro, así
            // que hasta que no salga no se avanza.
            onConfirmar={() => {
              setEnviando(true);
              setErrorEnvio(null);
              enviarSolicitud(datos)
                .then((r) => {
                  setReferencia(r.referencia ?? null);
                  setConstanciaAlCliente(r.constanciaAlCliente);
                  irA('S13');
                })
                .catch((e: unknown) =>
                  setErrorEnvio(
                    e instanceof Error ? e.message : 'No pudimos enviar la solicitud.',
                  ),
                )
                .finally(() => setEnviando(false));
            }}
            // «Reiniciar cotización» vuelve al inicio del formulario, no a la
            // cotización: es lo que hace el prototipo (spec 7.9).
            onReiniciar={() => irA('S02')}
            onEditar={editarDesdeResumen}
            onBack={() => irA('S11')}
        />
      );

    case 'S13':
      return (
        <S13Emision
          referencia={referencia}
          emailCliente={
            datos.asegurado.email !== '' ? datos.asegurado.email : datos.contacto.email
          }
          constanciaAlCliente={constanciaAlCliente}
          onWhatsapp={abrirWhatsapp}
          descargando={descargando}
          errorDescarga={errorDescarga}
          onDescargar={() => {
            setDescargando(true);
            setErrorDescarga(null);
            descargarConstancia(datos)
              .catch((e: unknown) =>
                setErrorDescarga(
                  e instanceof Error ? e.message : 'No pudimos generar la constancia.',
                ),
              )
              .finally(() => setDescargando(false));
          }}
        />
      );
  }
}
