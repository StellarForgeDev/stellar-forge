import type {
  ScenarioComparison,
  ScenarioComparisonResult,
} from "@/lib/playground/scenario-types";

const INTEGER = /^-?\d+$/;

function asBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? BigInt(value) : null;
  }
  if (typeof value === "string" && INTEGER.test(value)) {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function scenarioResultsEqual(left: unknown, right: unknown): boolean {
  const numericLeft = asBigInt(left);
  const numericRight = asBigInt(right);
  if (numericLeft !== null && numericRight !== null) {
    return numericLeft === numericRight;
  }
  return Object.is(left, right);
}

export function evaluateScenarioComparison(
  comparison: ScenarioComparison,
  before: unknown,
  after: unknown,
): ScenarioComparisonResult {
  const numericBefore = asBigInt(before);
  const numericAfter = asBigInt(after);

  if (
    comparison.relation === "increased" ||
    comparison.relation === "decreased"
  ) {
    if (numericBefore === null || numericAfter === null) {
      return {
        relation: comparison.relation,
        before,
        after,
        passed: false,
      };
    }

    const delta = numericAfter - numericBefore;
    return {
      relation: comparison.relation,
      before,
      after,
      delta: delta.toString(),
      passed:
        comparison.relation === "increased"
          ? delta > BigInt(0)
          : delta < BigInt(0),
    };
  }

  const unchanged = scenarioResultsEqual(before, after);
  return {
    relation: comparison.relation,
    before,
    after,
    passed: comparison.relation === "unchanged" ? unchanged : !unchanged,
  };
}
