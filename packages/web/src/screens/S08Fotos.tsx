import { Button } from '../components/Button.tsx';
import { Screen } from '../components/Screen.tsx';

/**
 * S08 · Intro del módulo de fotos.
 *
 * Avisa el tamaño de lo que viene antes de meter al usuario en nueve cargas
 * seguidas.
 */
interface Props {
  readonly onNext: () => void;
  readonly onBack: () => void;
}

export function S08Fotos({ onNext, onBack }: Props) {
  return (
    <Screen
      volverEnAcciones
      ancho="angosto"
      onBack={onBack}
      title="Adjuntá las fotos del vehículo"
      subtitle="*En el próximo paso vas a adjuntar las 9 fotos del vehículo."
      actions={<Button onClick={onNext}>Empezar</Button>}
    >
      <div className="mt-16 flex justify-center">
        <svg
          viewBox="0 0 120 100"
          className="w-32"
          role="img"
          aria-label="Adjuntar fotos"
        >
          <rect
            x="8"
            y="20"
            width="78"
            height="66"
            rx="8"
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth="5"
          />
          <path
            d="m18 70 20-20 14 14 10-10 16 16"
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M98 14v28M84 28h28"
            stroke="var(--color-muted)"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </Screen>
  );
}
