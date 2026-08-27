import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guards the architectural rule: platform runtime source must remain
// component-agnostic. It may read catalog data (which legitimately names
// components), but it must NOT branch on a specific component slug at runtime.
// Legitimate generic lookups such as `components.find(c => c.slug === slug)`
// compare against a variable, not a literal, and are therefore not flagged.

const PLATFORM_SOURCES = [
  "src/data/components.ts",
  "src/lib/transactions/parameter-types.ts",
  "src/lib/transactions/args.ts",
  "src/lib/transactions/validate.ts",
  "src/lib/transactions/builder.ts",
  "src/lib/transactions/prepare.ts",
  "src/lib/transactions/types.ts",
  "src/app/api/playground/route.ts",
  "src/lib/integration/generators.ts",
  "src/lib/playground/execution.ts",
  "src/components/playground/SandboxPanel.tsx",
  "src/components/transactions/TransactionBuilder.tsx",
  "src/components/transactions/MethodSelector.tsx",
  "src/app/playground/page.tsx",
];

const FORBIDDEN = [
  /slug\s*===?\s*["'](token|payment|escrow|access-control|multi-signature|subscription|staking)["']/,
  /["'](token|payment|escrow|access-control|multi-signature|subscription|staking)["']\s*===?\s*slug/,
  /switch\s*\(\s*slug\s*\)/,
  /case\s+["'](token|payment|escrow|access-control|multi-signature|subscription|staking)["']\s*:/,
];

describe("platform source remains component-agnostic", () => {
  for (const rel of PLATFORM_SOURCES) {
    it(`does not branch on a specific component slug in ${rel}`, () => {
      const abs = path.resolve(process.cwd(), rel);
      const content = readFileSync(abs, "utf8");
      const violations = FORBIDDEN.filter((re) => re.test(content));
      expect(
        violations,
        `${rel} must not contain component-specific runtime branching`,
      ).toEqual([]);
    });
  }
});
