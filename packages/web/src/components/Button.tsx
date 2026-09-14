import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { WhatsappIcon } from './icons.tsx';

/**
 * C2 · Botón.
 *
 * Tres variantes y un estado deshabilitado. Alto 58 px y radio 12 px, medidos
 * sobre los artboards — no es el radio pill que sugería la spec funcional.
 */
type Variant = 'primary' | 'secondary' | 'whatsapp';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-white disabled:bg-primary-disabled disabled:cursor-not-allowed',
  secondary:
    'bg-white text-primary border border-primary disabled:text-primary-disabled disabled:border-primary-disabled disabled:cursor-not-allowed',
  whatsapp: 'bg-whatsapp text-white disabled:opacity-60 disabled:cursor-not-allowed',
};

export function Button({ variant = 'primary', children, className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`flex h-[58px] w-full items-center justify-center gap-2 rounded-button px-4 text-base font-semibold transition-opacity ${VARIANTS[variant]} ${className}`}
    >
      {variant === 'whatsapp' ? <WhatsappIcon width={20} height={20} /> : null}
      {children}
    </button>
  );
}
