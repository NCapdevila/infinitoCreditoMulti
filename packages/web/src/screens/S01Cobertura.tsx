import { Button } from '../components/Button.tsx';
import { DataList, DataRow } from '../components/DataList.tsx';
import { Screen } from '../components/Screen.tsx';
import { CarIcon, MailIcon, PersonIcon, PhoneIcon, ShieldIcon } from '../components/icons.tsx';
import type { Contratacion } from '../lib/contratacion.ts';

/**
 * S01 · «¡Ya elegiste tu cobertura!»
 *
 * Bifurca entre autogestión y asistencia humana. El teléfono va en azul porque
 * es accionable.
 *
 * Falta resolver (spec 7.1): a qué número va WhatsApp — ¿el fijo de CE Brokers
 * o el del vendedor de la agencia? — y si el mensaje lleva el id de cotización.
 */
interface Props {
  readonly datos: Contratacion;
  readonly onContratar: () => void;
  readonly onWhatsapp: () => void;
  readonly onBack?: () => void;
}

export function S01Cobertura({ datos, onContratar, onWhatsapp, onBack }: Props) {
  const { contacto, vehiculo, cobertura } = datos;

  return (
    <Screen
      ancho="campo"
      onBack={onBack}
      title={
        <>
          ¡Ya elegiste
          <br />
          tu cobertura!
        </>
      }
      subtitle="Un asesor se va a estar comunicando con vos para ayudarte con la contratación."
      actions={
        <>
          <Button onClick={onContratar}>Contratar Online</Button>
          <Button variant="secondary" onClick={onWhatsapp}>
            Continuar por Whatsapp
          </Button>
        </>
      }
    >
      <DataList>
        <DataRow icon={PersonIcon}>{contacto.nombre}</DataRow>
        {/* La versión que devuelve el motor ya incluye el modelo
            ("AMAROK 20TD 4X2 DC COMFORT"): repetirlo daría "Cronos Cronos 1.3". */}
        <DataRow icon={CarIcon}>
          {vehiculo.marca} {vehiculo.version} {vehiculo.anio}
        </DataRow>
        <DataRow icon={PhoneIcon} emphasis>
          <a href={`tel:${contacto.telefono.replace(/\s|-/g, '')}`}>{contacto.telefono}</a>
        </DataRow>
        <DataRow icon={MailIcon}>{contacto.email}</DataRow>
        <DataRow icon={ShieldIcon}>
          {cobertura.compania.toUpperCase()} - {cobertura.plan}
        </DataRow>
      </DataList>
    </Screen>
  );
}
