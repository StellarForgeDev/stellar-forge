import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stellarComponents } from "@/data/components";

// Guards the architectural rule: platform runtime source must remain
// component-agnostic. It may read catalog data (which legitimately names
// components), but it must NOT branch on — or hardcode a reference to — a
// specific component slug at runtime. Legitimate generic lookups such as
// `components.find(c => c.slug === slug)` compare against a variable, not a
// literal, and are therefore not flagged.
//
// The set of protected slugs is DERIVED from the catalog, so the guard covers
// every shipped component (including any added later) automatically.
//
// The scanned source set is also DERIVED: every non-test TypeScript/TSX file
// under src/ is scanned, so a newly added platform file can never silently fall
// outside the guard because someone forgot to add it to a hand-maintained list.
// Two data files are intentionally excluded: the catalog itself (which, by
// definition, names every component) and the deployment-address registry
// (which stores slug+address pairs as data, not branching logic).

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SRC_ROOT = path.resolve(process.cwd(), "src");
const DATA_FILES = new Set([
  path.resolve(SRC_ROOT, "data/components.ts"),
  path.resolve(SRC_ROOT, "lib/transactions/deployments.ts"),
]);

function collectPlatformSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectPlatformSources(full, acc);
    } else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx")
    ) {
      const abs = path.resolve(full);
      if (!DATA_FILES.has(abs)) acc.push(abs);
    }
  }
  return acc;
}

const slugs = stellarComponents.map((component) => component.slug);
const slugAlternation = slugs.map(escapeRegex).join("|");

const FORBIDDEN = [
  new RegExp(`slug\\s*===?\\s*["'](${slugAlternation})["']`),
  new RegExp(`["'](${slugAlternation})["']\\s*===?\\s*slug`),
  /switch\s*\(\s*slug\s*\)/,
  new RegExp(`case\\s+["'](${slugAlternation})["']\\s*:`),
  new RegExp(`getComponentBySlug\\(\\s*["'](${slugAlternation})["']`),
  new RegExp(`componentSlug\\s*:\\s*["'](${slugAlternation})["']`),
];

describe("platform source remains component-agnostic", () => {
  it("the catalog is the single source of truth for guarded slugs", () => {
    expect(slugs.length).toBeGreaterThan(0);
    // The guard must cover every catalog slug. This is verified entirely from
    // the derived slug set (no hand-maintained slug list): each catalog slug
    // must participate in the derived FORBIDDEN alternation, so a newly added
    // component is guarded automatically and this test cannot drift.
    for (const slug of stellarComponents.map((c) => c.slug)) {
      expect(slugAlternation).toContain(escapeRegex(slug));
      expect(slugs).toContain(slug);
    }
  });

  const sources = collectPlatformSources(SRC_ROOT);

  it("scans the derived platform source set (not a hand-maintained list)", () => {
    // Sanity: the derivation must actually pick up known platform files so the
    // guard cannot silently miss a newly added one. Normalize separators so the
    // check is platform-independent.
    expect(sources.length).toBeGreaterThan(0);
    const rel = sources.map((s) =>
      path.relative(SRC_ROOT, s).split(path.sep).join("/"),
    );
    expect(rel).toContain("lib/transactions/builder.ts");
    expect(rel).toContain("lib/integration/generators.ts");
  });

  for (const abs of sources) {
    const rel = path.relative(process.cwd(), abs).split(path.sep).join("/");
    it(`does not hardcode a component slug in ${rel}`, () => {
      const content = readFileSync(abs, "utf8");
      const violations = FORBIDDEN.filter((re) => re.test(content));
      expect(
        violations,
        `${rel} must not contain component-specific slug references`,
      ).toEqual([]);
    });
  }
});
