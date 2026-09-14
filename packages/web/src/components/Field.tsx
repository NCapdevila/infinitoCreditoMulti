import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDownIcon, PencilIcon } from './icons.tsx';

/**
 * C3 · Campo de texto y C4 · Select.
 *
 * Alto 48 px y radio 8 px, medidos sobre los artboards. El lápiz no es
 * decorativo: marca los campos que vienen prellenados de la cotización y que
 * el usuario puede corregir.
 */
const FIELD =
  'h-12 w-full rounded-field border border-line bg-white px-4 text-base text-ink ' +
  'placeholder:text-placeholder focus:border-primary focus:outline-none ' +
  'disabled:bg-surface disabled:text-muted';

interface FieldShellProps {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
  /** Se marca lo que se puede dejar vacío; el resto se asume necesario. */
  readonly opcional?: boolean;
  readonly children: ReactNode;
}

function FieldShell({ id, label, error, opcional, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-muted text-sm">
        {label}
        {opcional === true && <span className="text-muted/60"> (opcional)</span>}
      </label>
      <div className="relative">{children}</div>
      {error !== undefined && (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  readonly id: string;
  readonly label: string;
  /** Muestra el lápiz: el valor viene prellenado y se puede corregir. */
  readonly editable?: boolean;
  readonly error?: string;
  readonly opcional?: boolean;
}

export function TextField({ id, label, editable, error, opcional, ...props }: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} error={error} opcional={opcional}>
      <input
        id={id}
        {...props}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? `${id}-error` : undefined}
        className={`${FIELD} ${editable === true ? 'pr-12' : ''} ${
          error !== undefined ? 'border-red-500' : ''
        }`}
      />
      {editable === true && (
        <PencilIcon
          width={20}
          height={20}
          className="text-line pointer-events-none absolute top-1/2 right-4 -translate-y-1/2"
        />
      )}
    </FieldShell>
  );
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly options: readonly SelectOption[];
  readonly error?: string;
  readonly opcional?: boolean;
}

export function SelectField({
  id,
  label,
  placeholder,
  options,
  error,
  opcional,
  value,
  ...props
}: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} error={error} opcional={opcional}>
      <select
        id={id}
        value={value}
        {...props}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? `${id}-error` : undefined}
        className={`${FIELD} appearance-none pr-12 ${value === '' ? 'text-placeholder' : ''} ${
          error !== undefined ? 'border-red-500' : ''
        }`}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value} className="text-ink">
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        width={20}
        height={20}
        className="text-ink pointer-events-none absolute top-1/2 right-4 -translate-y-1/2"
      />
    </FieldShell>
  );
}
