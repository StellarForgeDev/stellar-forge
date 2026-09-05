import type {
  GuidedStepResult,
  ScenarioArgument,
  ScenarioResultReference,
  ScenarioStep,
} from "@/lib/playground/scenario-types";
import { resolveScenarioFixtureReference } from "@/lib/playground/scenario-fixtures";

export type ResultReferenceErrorKind =
  | "malformed"
  | "missing-step"
  | "missing-result"
  | "invalid-path";

export interface ResultReferenceError {
  kind: ResultReferenceErrorKind;
  message: string;
}

export type ResultReferenceResolution =
  | { ok: true; value: unknown }
  | { ok: false; error: ResultReferenceError };

export function isScenarioResultReference(
  value: unknown,
): value is ScenarioResultReference {
  return (
    typeof value === "object" &&
    value !== null &&
    "reference" in value &&
    typeof value.reference === "string"
  );
}

function isFixtureReference(value: unknown): value is { fixture: string } {
  return typeof value === "object" && value !== null && "fixture" in value && typeof value.fixture === "string";
}

export function parseResultReference(
  reference: string,
  stepIds: readonly string[],
): { ok: true; stepId: string; path: string[] } | { ok: false; error: ResultReferenceError } {
  if (reference.length === 0) {
    return {
      ok: false,
      error: { kind: "malformed", message: "result reference must not be empty" },
    };
  }

  const matchingStepId = [...stepIds]
    .sort((left, right) => right.length - left.length)
    .find(
      (stepId) =>
        reference === `${stepId}.result` ||
        reference.startsWith(`${stepId}.result.`),
    );

  if (!matchingStepId) {
    return {
      ok: false,
      error: {
        kind: reference.includes(".result") ? "missing-step" : "malformed",
        message: `result reference must use an existing step's result: ${reference}`,
      },
    };
  }

  const suffix = reference.slice(`${matchingStepId}.result`.length);
  if (suffix.length === 0) {
    return { ok: true, stepId: matchingStepId, path: [] };
  }

  const path = suffix.slice(1).split(".");
  if (path.some((segment) => segment.length === 0)) {
    return {
      ok: false,
      error: {
        kind: "malformed",
        message: `result reference contains an empty path segment: ${reference}`,
      },
    };
  }
  return { ok: true, stepId: matchingStepId, path };
}

function readPath(value: unknown, path: readonly string[]): ResultReferenceResolution {
  let current = value;
  for (const segment of path) {
    if (current === null || typeof current !== "object") {
      return {
        ok: false,
        error: {
          kind: "invalid-path",
          message: `result path segment is unavailable: ${segment}`,
        },
      };
    }
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) {
        return {
          ok: false,
          error: { kind: "invalid-path", message: `array index is invalid: ${segment}` },
        };
      }
      current = current[Number(segment)];
    } else {
      if (!Object.prototype.hasOwnProperty.call(current, segment)) {
        return {
          ok: false,
          error: { kind: "invalid-path", message: `result property is unavailable: ${segment}` },
        };
      }
      current = (current as Record<string, unknown>)[segment];
    }
  }
  if (current === undefined) {
    return {
      ok: false,
      error: { kind: "missing-result", message: "referenced result is unavailable" },
    };
  }
  return { ok: true, value: current };
}

export function resolveResultReference(
  reference: string,
  results: readonly GuidedStepResult[],
  stepIds: readonly string[],
): ResultReferenceResolution {
  const parsed = parseResultReference(reference, stepIds);
  if (!parsed.ok) return parsed;

  const result = results.find(
    (candidate) => candidate.scenarioStep.id === parsed.stepId,
  );
  if (!result || result.actual === undefined) {
    return {
      ok: false,
      error: {
        kind: "missing-result",
        message: `result is not available for step ${parsed.stepId}`,
      },
    };
  }
  return readPath(result.actual, parsed.path);
}

export function resolveScenarioArguments(
  args: readonly ScenarioArgument[],
  results: readonly GuidedStepResult[],
  stepIds: readonly string[],
  fixtures?: import("@/lib/playground/scenario-types").ScenarioFixtures,
): { ok: true; values: unknown[] } | { ok: false; error: ResultReferenceError } {
  const values: unknown[] = [];
  for (const arg of args) {
    if (isFixtureReference(arg)) {
      const resolved = resolveScenarioFixtureReference(arg.fixture, fixtures);
      if (!resolved.ok) return { ok: false, error: { kind: "missing-result", message: resolved.error } };
      values.push(resolved.value);
      continue;
    }
    if (!isScenarioResultReference(arg)) {
      values.push(arg);
      continue;
    }
    const resolved = resolveResultReference(arg.reference, results, stepIds);
    if (!resolved.ok) return resolved;
    values.push(resolved.value);
  }
  return { ok: true, values };
}

export function formatScenarioArgument(arg: ScenarioArgument): string {
  if (isFixtureReference(arg)) return arg.fixture;
  if (isScenarioResultReference(arg)) return arg.reference;
  if (arg === null) return "null";
  return String(arg);
}

export function earlierScenarioSteps(
  steps: readonly ScenarioStep[],
  index: number,
): string[] {
  return steps.slice(0, index).map((step) => step.id);
}
