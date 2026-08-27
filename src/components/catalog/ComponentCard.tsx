"use client";

import Link from "next/link";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { StateBadge } from "@/components/ui/StateBadge";
import { LinkButton } from "@/components/ui/LinkButton";
import { InterfaceReference } from "@/components/docs/InterfaceReference";
import type { FunctionSpec } from "@/data/components";

export interface ComponentCardProps {
  name: string;
  description: string;
  category: string;
  status?: string;
  href: string;
  cta?: string;
  capabilities?: { sandbox: boolean; testnet: boolean };
  functionCount?: number;
  functions?: FunctionSpec[];
  expandable?: boolean;
  playgroundSlug?: string;
}

export function ComponentCard({
  name,
  description,
  category,
  status = "Concept",
  href,
  cta = "View component",
  capabilities,
  functionCount,
  functions,
  expandable = false,
  playgroundSlug,
}: ComponentCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="flex h-full flex-col justify-between transition-colors duration-200 ease-out hover:border-accent-stellar/60 focus-within:border-accent-stellar/60 motion-reduce:transition-none">
      <div>
        <Link
          href={href}
          className="block rounded-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wide text-text-secondary">
              {category}
            </span>

            {!capabilities && (
              <span className="rounded-default border border-border px-2 py-0.5 font-mono text-[11px] text-accent-stellar">
                {status}
              </span>
            )}
          </div>
          {capabilities && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StateBadge tone={capabilities.sandbox ? "local" : "neutral"}>
                Sandbox
              </StateBadge>
              <StateBadge tone={capabilities.testnet ? "testnet" : "neutral"}>
                Testnet
              </StateBadge>
              {functionCount != null && (
                <StateBadge tone="neutral">{functionCount} fns</StateBadge>
              )}
            </div>
          )}

          <h3 className="mt-3 font-display text-lg font-medium text-text-primary">
            {name}
          </h3>
          <p className="mt-2 font-sans text-sm leading-relaxed text-text-secondary">
            {description}
          </p>
        </Link>

        {expandable && functions && functions.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls={
                expandable && functions?.length
                  ? `interface-${playgroundSlug}`
                  : undefined
              }
              className="flex w-full items-center justify-between gap-2 rounded-default font-mono text-xs text-text-secondary transition-colors duration-200 hover:text-accent-stellar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar motion-reduce:transition-none"
            >
              <span>
                Interface{functionCount != null ? ` · ${functionCount} fns` : ""}
              </span>
              <span aria-hidden="true">{open ? "▾" : "▸"}</span>
            </button>

            {open && (
              <div
                id={`interface-${playgroundSlug}`}
                className="mt-3 max-h-56 overflow-y-auto pr-1"
              >
                <InterfaceReference
                  functions={functions}
                  compact
                  componentSlug={playgroundSlug}
                  methodAction
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6">
        {playgroundSlug ? (
          <LinkButton
            href={`/playground?component=${encodeURIComponent(playgroundSlug)}`}
            variant="secondary"
          >
            Open in Playground →
          </LinkButton>
        ) : (
          <Link
            href={href}
            className="inline-flex items-center gap-1 font-mono text-xs text-text-secondary transition-colors duration-200 hover:text-accent-stellar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar motion-reduce:transition-none"
          >
            {cta}
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </Card>
  );
}
