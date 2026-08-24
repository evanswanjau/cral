import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import type { FieldError } from "react-hook-form";

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: FieldError | undefined;
  /** Rendered top-right of the label row, e.g. a "Show" toggle or "Forgot password?" link. */
  labelAction?: ReactNode;
}

// react-hook-form's register() passes a ref to bind the input for
// validation/focus management — without forwardRef here, that ref silently
// fails to attach (React warns, and RHF loses native focus-on-error).
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, error, labelAction, id, className, ...rest },
  ref,
) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label
          htmlFor={id}
          className="font-mono text-[11px] font-medium uppercase tracking-widest text-neutral-500"
        >
          {label}
        </label>
        {labelAction}
      </div>
      <input
        ref={ref}
        id={id}
        className={`h-10 rounded-[10px] border px-3.5 text-sm text-ink placeholder:text-neutral-400 focus:outline-none focus:ring-[3px] ${
          error
            ? "border-cruz-red focus:ring-cruz-red/20"
            : "border-neutral-300 focus:border-cruz-blue focus:ring-cruz-blue/20"
        } ${className ?? ""}`}
        {...rest}
      />
      {error && <span className="text-xs text-cruz-red">{error.message}</span>}
    </div>
  );
});
