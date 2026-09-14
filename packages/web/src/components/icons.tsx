/**
 * Íconos del cotizador.
 *
 * Inline y en `currentColor`: son pocos y chicos, y así heredan el color del
 * contexto sin arrastrar una librería de íconos entera al bundle.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
  ...props,
});

export const PersonIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="10" r="2.6" />
    <path d="M7.2 18.2a5.4 5.4 0 0 1 9.6 0" />
  </svg>
);

export const CarIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 15.5V13l1.7-4.2A2 2 0 0 1 7.6 7.5h8.8a2 2 0 0 1 1.9 1.3L20 13v2.5" />
    <path d="M4 13h16" />
    <circle cx="7.5" cy="16" r="1.5" />
    <circle cx="16.5" cy="16" r="1.5" />
  </svg>
);

export const PhoneIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6.5 4h3l1.5 3.8-2 1.4a11 11 0 0 0 5.8 5.8l1.4-2L20 14.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4Z" />
  </svg>
);

export const MailIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="m3.8 7 7.1 5.3a2 2 0 0 0 2.2 0L20.2 7" />
  </svg>
);

export const ShieldIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.5 19 6v5.4c0 4-2.8 7.5-7 9.1-4.2-1.6-7-5.1-7-9.1V6l7-2.5Z" />
  </svg>
);

export const DocumentIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5.5-5.5Z" />
    <path d="M13.5 3.5V9H19" />
  </svg>
);

export const MailboxIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 11a3.5 3.5 0 0 1 7 0v7H4v-7Z" />
    <path d="M11 18h9v-7a3.5 3.5 0 0 0-3.5-3.5H7.5" />
    <path d="M6.5 11h2" />
    <path d="M17 7.5v-3" />
  </svg>
);

export const CardIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 10h18" />
  </svg>
);

export const BankIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 10h16M5 10v8m4-8v8m6-8v8m4-8v8M3 19h18" />
    <path d="m12 4 8 4H4l8-4Z" />
  </svg>
);

export const CalendarIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3.5v4m8-4v4" />
  </svg>
);

export const MoneyIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10m2.2-7.4a2.4 2.4 0 0 0-2.2-1.2c-1.3 0-2.3.8-2.3 1.9 0 2.4 4.6 1.4 4.6 3.7 0 1.1-1 1.9-2.3 1.9a2.5 2.5 0 0 1-2.3-1.3" />
  </svg>
);

export const ImageIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="m5 17 4.5-4.5 3 3 2.5-2.5L21 18" />
  </svg>
);

export const ClipIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9.2" />
    <path d="M14.6 9.4 10.9 13a1.6 1.6 0 0 0 2.3 2.3l3.1-3.1a3.1 3.1 0 0 0-4.4-4.4l-3.2 3.2a4.6 4.6 0 0 0 6.5 6.5" />
  </svg>
);

export const PencilIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 20h4L19.2 8.8a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z" />
    <path d="m14.5 6.5 3 3" />
  </svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 9.5 6 6 6-6" />
  </svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m14.5 6-6 6 6 6" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m7 7 10 10M17 7 7 17" />
  </svg>
);

export const CheckCircleIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.2 2.6 2.6L16 9.4" />
  </svg>
);

export const WhatsappIcon = (p: IconProps) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.1-.2 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5v-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a1 1 0 0 0-.7.3c-.3.3-.9.9-.9 2.1s.9 2.5 1 2.6a9.5 9.5 0 0 0 3.7 3.3c1.4.6 1.9.6 2.6.5.4 0 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.4-.2Z" />
  </svg>
);

/**
 * Logo de Infinito Créditos.
 *
 * Es el mismo archivo que sirve el motor, para que el salto entre la cotización
 * y la contratación no cambie de marca a mitad de camino.
 */
export const LogoInfinito = ({ className = '' }: { readonly className?: string }) => (
  <img
    src="/logo-infinito.png"
    alt="Infinito Créditos"
    width={97}
    height={52}
    /* El archivo viene recortado al contenido: sin margen transparente. */
    className={`h-13 w-auto object-contain md:h-16 ${className}`}
  />
);
