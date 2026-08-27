import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonClasses, type ButtonVariant } from "./Button";

export interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
}

/**
 * A navigation link rendered with the same interaction language as `Button`,
 * so primary/secondary/ghost CTAs stay visually consistent with real buttons.
 * Used for button-like links (e.g. the navbar "Get Started"); ordinary inline
 * text links remain plain `Link`s.
 */
export function LinkButton({
  variant = "secondary",
  className = "",
  ...props
}: LinkButtonProps) {
  return <Link className={buttonClasses(variant, className)} {...props} />;
}
