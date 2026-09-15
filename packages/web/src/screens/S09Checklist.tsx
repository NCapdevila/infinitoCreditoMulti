import { useState } from 'react';
import { Button } from '../components/Button.tsx';
import { Modal } from '../components/Modal.tsx';
import { Screen } from '../components/Screen.tsx';
import { Dropzone, FilaToma } from '../components/Upload.tsx';
import { ARCHIVO, TOMAS, type FotoCargada, type TipoToma } from '../lib/contratacion.ts';
import { comprimirImagen } from '../lib/imagenes.ts';

/**
 * S09 · Checklist de las nueve tomas, y S09b · el modal de carga de cada una.
 *
 * A diferencia del prototipo —donde subir una foto tildaba las nueve—, cada
 * carga marca sólo su propia toma.
 *
 * Los tips de las cuatro últimas tomas no están definidos (spec 7.5): las filas
 * sin tip simplemente no muestran el «?», en vez de inventar un texto.
 */
interface Props {
  readonly fotos: readonly FotoCargada[];
  readonly onFoto: (foto: FotoCargada) => void;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

export function S09Checklist({ fotos, onFoto, onNext, onBack }: Props) {
  const [tomaActiva, setTomaActiva] = useState<TipoToma | null>(null);
  const [procesando, setProcesando] = useState(false);

  const cargadaDe = (tipo: TipoToma) => fotos.find((f) => f.tipo === tipo);
  const completas = TOMAS.every((t) => cargadaDe(t.tipo) !== undefined);
  const toma = TOMAS.find((t) => t.tipo === tomaActiva);

  return (
    <>
      <Screen
          ancho="campo"
        onBack={onBack}
        title="Fotos del vehículo"
        subtitle={`${fotos.length} de ${TOMAS.length} cargadas`}
        actions={
          <Button onClick={onNext} disabled={!completas}>
            Siguiente
          </Button>
        }
      >
        <div className="mt-8 flex flex-col gap-2.5">
          {TOMAS.map((t) => {
            const cargada = cargadaDe(t.tipo);
            return (
              <FilaToma
                key={t.tipo}
                label={t.label}
                tip={'tip' in t ? t.tip : undefined}
                // Hasta que hay foto, la miniatura muestra el ejemplo: así se
                // entiende qué se pide sin tener que abrir cada fila.
                previewUrl={cargada?.previewUrl ?? ('ejemplo' in t ? t.ejemplo : undefined)}
                cargada={cargada !== undefined}
                onClick={() => setTomaActiva(t.tipo)}
              />
            );
          })}
        </div>
      </Screen>

      <Modal
        open={toma !== undefined}
        onClose={() => setTomaActiva(null)}
        title={toma?.label}
      >
        {toma !== undefined && (
          <>
            {'tip' in toma && <p className="text-muted -mt-3 text-center text-sm">*{toma.tip}</p>}

            {'ejemplo' in toma && (
              <div className="rounded-field border-line/60 mt-5 border p-4 text-center">
                {/* Chica y completa: es una referencia de encuadre, no una foto
                    para mirar en detalle. */}
                <img
                  src={toma.ejemplo}
                  alt={`Ejemplo de la foto: ${toma.label}`}
                  className="bg-surface mx-auto h-24 w-auto rounded-md object-contain"
                />
                <p className="text-ink mt-3 text-sm font-semibold">Imagen de ejemplo</p>
                <p className="text-muted text-xs">Asegurate de que la imagen sea clara</p>
              </div>
            )}

            <div className="mt-5">
              <Dropzone
                onFile={(file) => {
                  setProcesando(true);
                  // Se comprime antes de guardarla: una foto de celular pesa
                  // demasiado para viajar por correo.
                  void comprimirImagen(file)
                    .then((dataUrl) => {
                      onFoto({
                        tipo: toma.tipo,
                        nombreArchivo: file.name,
                        previewUrl: dataUrl,
                      });
                      setTomaActiva(null);
                    })
                    .finally(() => setProcesando(false));
                }}
              />
            </div>

            {procesando && (
              <p className="text-muted mt-3 text-center text-sm">Preparando la foto…</p>
            )}

            <p className="text-muted/80 mt-4 text-center text-xs">
              Tipos de archivo admitidos: {ARCHIVO.extensiones.join(', ')} (menores a{' '}
              {ARCHIVO.maxLabel})
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
