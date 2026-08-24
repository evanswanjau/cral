import type { InputHTMLAttributes } from "react";
import type { FieldError } from "react-hook-form";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: FieldError | undefined;
}

export function FormField({ label, error, id, ...rest }: FormFieldProps): JSX.Element {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        id={id}
        className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        {...rest}
      />
      {error && <span className="text-xs text-red-600">{error.message}</span>}
    </label>
  );
}
