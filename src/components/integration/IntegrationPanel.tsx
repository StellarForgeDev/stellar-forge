"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { StateBadge } from "@/components/ui/StateBadge";
import type { StellarComponent } from "@/data/components";
import { generateIntegrationCode } from "@/lib/integration/generators";
import {
  INTEGRATION_LANGUAGES,
  type IntegrationLanguage,
} from "@/lib/integration/types";

export function IntegrationPanel({
  component,
  configValues,
}: {
  component: StellarComponent;
  configValues: Record<string, string>;
}) {
  const [language, setLanguage] = useState<IntegrationLanguage>("rust");

  const code = useMemo(
    () =>
      generateIntegrationCode({ component, configValues }, language),
    [component, configValues, language],
  );

  const languageLabel =
    INTEGRATION_LANGUAGES.find((option) => option.value === language)?.label ??
    "Rust";

  if (code === null) {
    return (
      <Card id="integration">
        <p className="font-mono text-xs uppercase tracking-wide text-text-secondary">
          Integration
        </p>

        <h2 className="mt-3 font-display text-xl font-medium text-text-primary">
          Integration code
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-text-secondary">
          {component.name} is currently a catalog concept without a contract
          implementation or interface. Integration code will become available
          here once the component receives an implementation and interface
          spec.
        </p>
      </Card>
    );
  }

  return (
    <Card id="integration">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
              Integration
            </p>

            <StateBadge tone="testnet">Stellar / Soroban</StateBadge>
          </div>

          <h2 className="mt-3 font-display text-xl font-medium text-text-primary">
            Use this component in your project
          </h2>

          <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-text-secondary">
            A {languageLabel} integration example generated from the catalog
            interface and your configuration above, a starting point for real
            integration work, not a complete SDK. Verify the output against your
            project before shipping.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <label className="block min-w-40">
          <span className="font-sans text-sm text-text-primary">Language</span>

          <select
            value={language}
            onChange={(event) =>
              setLanguage(event.target.value as IntegrationLanguage)
            }
            className="mt-2 w-full rounded-default border border-border bg-surface px-3 py-2 font-mono text-sm text-text-primary"
          >
            {INTEGRATION_LANGUAGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <CopyButton value={code} label="Copy code" variant="secondary" />
      </div>

      <pre className="mt-4 max-h-96 min-w-0 overflow-auto rounded-default border border-border bg-canvas/60 p-4 font-mono text-xs leading-relaxed text-text-secondary">
        <code>{code}</code>
      </pre>
    </Card>
  );
}