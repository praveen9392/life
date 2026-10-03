import { forwardRef, useId } from "react";

import { cn } from "../../utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | undefined;
  helpText?: string;
}

/** Accessible form field: programmatic label/error/help wiring, inline
 * validation message, and consistent styling across every form. */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helpText, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const helpId = `${inputId}-help`;

    return (
      <div className="w-full">
        {label ? (
          <label htmlFor={inputId} className="label">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={cn("input", error && "border-danger focus:border-danger focus:ring-danger/30", className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : helpText ? helpId : undefined}
          {...props}
        />
        {error ? (
          <p id={errorId} role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        ) : helpText ? (
          <p id={helpId} className="mt-1 text-xs text-text-muted">
            {helpText}
          </p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = "Input";
