import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  children: ReactNode;
}

const baseStyles = [
  "inline-flex items-center justify-center gap-2",
  "rounded-default px-4 py-2",
  "font-sans text-sm font-medium",
  "transition-colors duration-150 ease-out motion-reduce:transition-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
  "disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed",
].join(" ");

const variantStyles: Record<ButtonVariant, string> = {
  // accent-forge = active/primary action. High-contrast dark foreground
  // on the warm accent, per the locked semantic color rule.
  primary:
    "bg-accent-forge text-canvas hover:bg-accent-forge/90 active:bg-accent-forge/80",

  // accent-stellar = passive/structural. Outline only, never a solid fill,
  // so it reads as secondary next to a primary forge button.
  secondary:
    "bg-transparent border border-accent-stellar text-accent-stellar hover:bg-accent-stellar/10 active:bg-accent-stellar/15",

  // No accent color at all — lowest-emphasis action.
  ghost:
    "bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface active:bg-surface/80",
};

/** Shared class builder so `LinkButton` and `Button` stay in lockstep. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  className = "",
): string {
  return [baseStyles, variantStyles[variant], className].filter(Boolean).join(" ");
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin motion-reduce:animate-none"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}

export function Button({
  variant = "primary",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      className={buttonClasses(variant, className)}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
