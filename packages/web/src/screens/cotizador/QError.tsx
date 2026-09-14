import { Button } from '../../components/Button.tsx';
import { Screen } from '../../components/Screen.tsx';

/**
 * No se pudo hablar con el motor de cotización.
 *
 * Dice qué pasó y ofrece la única acción útil: volver a intentar. Un 502 del
 * BFF significa que el markup del motor cambió — ahí el reintento no alcanza y
 * hay que avisar a alguien, pero eso se ve en los logs del servidor.
 */
interface Props {
  readonly mensaje: string;
  readonly onReintentar: () => void;
}

export function QError({ mensaje, onReintentar }: Props) {
  return (
    <Screen
      title="No pudimos cotizar"
      actions={<Button onClick={onReintentar}>Reintentar</Button>}
    >
      <p className="text-muted mt-8 text-center text-sm text-balance">{mensaje}</p>
    </Screen>
  );
}
