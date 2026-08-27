import type { ReactNode } from "react";

export type StateTone =
  | "success"
  | "error"
  | "pending"
  | "local"
  | "testnet"
  | "neutral";

/**
 * Lightweight status chip. The tone language is intentionally small:
 *  - success / error / pending  → feedback states
 *  - local   (forge orange)     → build / local sandbox / configuration
 *  - testnet (stellar cyan)      → network / on-chain / Testnet
 * This mirrors the semantic cyan↔orange duality used across Stellar-Forge.
 */
const toneStyles: Record<StateTone, string> = {
  success: "border-tone-success/50 text-tone-success",
  error: "border-tone-error/50 text-tone-error",
  pending: "border-border text-tone-pending",
  local: "border-tone-local/50 text-tone-local",
  testnet: "border-tone-onchain/50 text-tone-onchain",
  neutral: "border-border text-text-secondary",
};

export function StateBadge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: StateTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-default border px-2 py-0.5 font-mono text-[11px] ${toneStyles[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
