"use client";

import { useCopyFeedback } from "./useCopyFeedback";

const utilityClass =
  "inline-flex items-center gap-1 rounded-default px-2 py-0.5 font-mono text-[11px] text-text-secondary transition-colors duration-150 ease-out hover:text-accent-stellar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar motion-reduce:transition-none";

const secondaryClass =
  "inline-flex items-center justify-center gap-2 rounded-default border border-accent-stellar px-4 py-2 font-sans text-sm font-medium text-accent-stellar transition-colors duration-150 ease-out hover:bg-accent-stellar/10 active:bg-accent-stellar/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-40";

export interface CopyButtonProps {
  value: string;
  label?: string;
  variant?: "utility" | "secondary";
  className?: string;
}

/**
 * One reusable copy action. Surfaces Copy → Copied → Copy failed via the shared
 * `useCopyFeedback` hook. `value` is what gets written to the clipboard; callers
 * must not change it.
 */
export function CopyButton({
  value,
  label = "Copy",
  variant = "utility",
  className = "",
}: CopyButtonProps) {
  const { copied, failed, copy } = useCopyFeedback();
  const base = variant === "secondary" ? secondaryClass : utilityClass;
  const text = copied ? "Copied" : failed ? "Copy failed" : label;

  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      aria-live="polite"
      className={`${base} ${className}`}
    >
      {text}
    </button>
  );
}
