import type { ReactNode } from 'react';
import { Button } from '../components/Button.tsx';
import { DataList, DataRow } from '../components/DataList.tsx';
import { Screen } from '../components/Screen.tsx';
import {
  BankIcon,
  CalendarIcon,
  CardIcon,
  CarIcon,
  DocumentIcon,
  ImageIcon,
  MailIcon,
  MailboxIcon,
  MoneyIcon,
  PersonIcon,
  PhoneIcon,
  PencilIcon,
  ShieldIcon,
} from '../components/icons.tsx';
import { CONDICIONES_FISCALES, SEXOS, TOMAS, type Contratacion } from '../lib/contratacion.ts';

/**
 * S12 · Validación final antes de emitir.
 *
 * Qué lleva lápiz y qué no sale de la spec: los datos que cambian la tarifa
 * —patente, modelo, compañía, cobertura, costo— y los que identifican a la
 * persona —DNI, fecha de nacimiento, condición fiscal— no se editan acá. De ahí
 * el aviso del pie.
 */
interface Props {
  readonly datos: Contratacion;
  readonly onConfirmar: () => void;
  readonly enviando?: boolean;
  /** Falla del envío: la carga no se pierde, se puede reintentar. */
  readonly errorEnvio?: string | null;
  readonly onReiniciar: () => void;
  readonly onEditar: (destino: 'asegurado' | 'domicilio' | 'vehiculo' | 'pago' | 'fotos') => void;
  readonly onBack: () => void;
}

function Seccion({ titulo, onEdit, children }: {
  readonly titulo: string;
  readonly onEdit?: () => void;
  readonly children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="flex items-center justify-center gap-2">
        <h2 className="text-ink text-base font-semibold">{titulo}</h2>
        {onEdit !== undefined && (
          <button type="button" onClick={onEdit} aria-label={`Editar ${titulo}`} className="text-line">
            <PencilIcon width={18} height={18} />
          </button>
        )}
      </div>
      <div className="mt-3">
        <DataList>{children}</DataList>
      </div>
    </section>
  );
}

const etiquetaDe = (opciones: readonly { value: string; label: string }[], value: string) =>
  opciones.find((o) => o.value === value)?.label ?? value;

export function S12Resumen({
  datos,
  onConfirmar,
  onReiniciar,
  onEditar,
  onBack,
  enviando,
  errorEnvio,
}: Props) {
  const { asegurado, domicilio, vehiculo, cobertura, medioDePago, fotos } = datos;
  const editarAsegurado = () => onEditar('asegurado');

  return (
    <Screen
      volverEnAcciones
      ancho="campo"
      onBack={onBack}
      title={
        <>
          ¡Ya elegiste
          <br />
          tu cobertura!
        </>
      }
      subtitle="Validá que los datos ingresados estén correctos. Recordá que serán los utilizados para enviar la documentación."
      actions={
        <>
          <Button onClick={onConfirmar} disabled={enviando === true}>
            {enviando === true ? 'Enviando…' : 'Confirmar datos'}
          </Button>
          <Button variant="secondary" onClick={onReiniciar} disabled={enviando === true}>
            Reiniciar cotización
          </Button>
        </>
      }
    >
      <Seccion titulo="Datos del asegurado">
        <DataRow icon={PersonIcon} onEdit={editarAsegurado} editLabel="Editar nombre">
          {asegurado.nombreCompleto || '—'}
        </DataRow>
        <DataRow icon={DocumentIcon}>
          {asegurado.tipoPersona === 'JURIDICA'
            ? `CUIT: ${asegurado.cuit || '—'}`
            : `DNI: ${asegurado.dni || '—'}`}
        </DataRow>
        <DataRow icon={PersonIcon} onEdit={editarAsegurado} editLabel="Editar sexo">
          {asegurado.sexo !== '' ? etiquetaDe(SEXOS, asegurado.sexo) : '—'}
        </DataRow>
        <DataRow icon={MailIcon} onEdit={editarAsegurado} editLabel="Editar e-mail">
          {asegurado.email || '—'}
        </DataRow>
        <DataRow icon={PhoneIcon} onEdit={editarAsegurado} editLabel="Editar teléfono">
          {asegurado.telefono || '—'}
        </DataRow>
        <DataRow icon={MailboxIcon} onEdit={() => onEditar('domicilio')} editLabel="Editar domicilio">
          {[domicilio.calle, domicilio.altura].filter((p) => p !== '').join(' ') || '—'}
        </DataRow>
        <DataRow icon={MailboxIcon}>CP: {domicilio.cp}</DataRow>
        <DataRow icon={DocumentIcon}>
          {asegurado.condicionFiscal !== ''
            ? etiquetaDe(CONDICIONES_FISCALES, asegurado.condicionFiscal)
            : '—'}
        </DataRow>
      </Seccion>

      <Seccion titulo="Datos del Vehículo">
        <DataRow icon={CarIcon}>
          {vehiculo.esCeroKm ? 'Patente: 0 KM' : `Patente: ${vehiculo.patente || '—'}`}
        </DataRow>
        <DataRow icon={CarIcon}>Modelo: {vehiculo.version}</DataRow>
        <DataRow icon={CarIcon} onEdit={() => onEditar('vehiculo')} editLabel="Editar motor">
          Motor: {vehiculo.motor || '—'}
        </DataRow>
        <DataRow icon={CarIcon} onEdit={() => onEditar('vehiculo')} editLabel="Editar chasis">
          Chasis: {vehiculo.chasis || '—'}
        </DataRow>
      </Seccion>

      {/*
        El prototipo no muestra las fotos en el resumen (spec 7.7). Se agrega el
        contador: son nueve cargas y el vendedor necesita confirmar que están
        antes de emitir.
      */}
      {!vehiculo.esCeroKm && (
        <Seccion titulo="Fotos del vehículo" onEdit={() => onEditar('fotos')}>
          <DataRow icon={ImageIcon}>
            {fotos.length} de {TOMAS.length} cargadas
          </DataRow>
        </Seccion>
      )}

      <Seccion titulo="Cobertura elegida">
        <DataRow icon={ShieldIcon}>Compañía elegida: {cobertura.compania}</DataRow>
        <DataRow icon={ShieldIcon}>
          Cobertura: [{cobertura.code}] - {cobertura.plan}
        </DataRow>
        <DataRow icon={MoneyIcon}>
          Costo <b className="text-ink font-semibold">{cobertura.costoMensual}</b>/mes
        </DataRow>
      </Seccion>

      <Seccion titulo="Medio de pago" onEdit={() => onEditar('pago')}>
        {medioDePago.tipo === 'TARJETA' ? (
          <>
            <DataRow icon={CardIcon}>Tarjeta de crédito</DataRow>
            <DataRow icon={BankIcon}>Banco: {medioDePago.banco || '—'}</DataRow>
            <DataRow icon={CardIcon}>Tarjeta {medioDePago.marcaTarjeta || '—'}</DataRow>
            <DataRow icon={CardIcon}>{medioDePago.numero || '—'}</DataRow>
            <DataRow icon={CalendarIcon}>Vto. {medioDePago.vencimiento || '—'}</DataRow>
          </>
        ) : (
          <>
            <DataRow icon={BankIcon}>CBU</DataRow>
            <DataRow icon={BankIcon}>Banco: {medioDePago.banco || '—'}</DataRow>
            <DataRow icon={CardIcon}>{medioDePago.cbu || '—'}</DataRow>
          </>
        )}
        <DataRow icon={PersonIcon}>{medioDePago.titular || '—'}</DataRow>
        <DataRow icon={DocumentIcon}>DNI: {medioDePago.titularDni || '—'}</DataRow>
      </Seccion>

      {errorEnvio !== null && errorEnvio !== undefined && (
        <div className="mt-8 rounded-field border border-red-200 bg-red-50 p-4">
          <p role="alert" className="text-center text-sm text-red-700">
            {errorEnvio}
          </p>
          <p className="mt-2 text-center text-xs text-red-600">
            Los datos siguen cargados: podés reintentar sin volver a empezar.
          </p>
        </div>
      )}

      <p className="text-accent mt-8 text-center text-sm text-balance">
        Si no encontrás la opción para editar, tenés que volver a realizar la cotización.
      </p>
    </Screen>
  );
}
