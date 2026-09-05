import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("ControlledDeploymentPanel hydration regression", () => {
  it("does not render nondeterministic new Date() during SSR", () => {
    const file = readFileSync(path.join(process.cwd(), "src/components/testnet/ControlledDeploymentPanel.tsx"), "utf8");
    // Ensure the previous hydration culprit is gone
    expect(file).not.toMatch(/<span>\{new Date\(\)\.toISOString\(\)\}<\/span>/);
    // Ensure deterministic placeholder or session-derived value is used with client mount guard
    expect(file).toMatch(/hasMounted/);
    expect(file).toMatch(/lastObservedDisplay/);
    expect(file).toMatch(/deploymentSession\.lastObservedAt/);
  });

  it("preserves authoritative session display without suppressHydrationWarning", () => {
    const file = readFileSync(path.join(process.cwd(), "src/components/testnet/ControlledDeploymentPanel.tsx"), "utf8");
    expect(file).not.toMatch(/suppressHydrationWarning/);
  });
});
