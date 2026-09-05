import { getComponentBySlug } from "@/data/components";
import { playgroundIdentityOptions } from "@/lib/playground/execution";
import {
  isScenarioResultReference,
  parseResultReference,
} from "@/lib/playground/scenario-references";
import type {
  PlaygroundScenario,
  ScenarioArgument,
  ScenarioStep,
  ScenarioValidationIssue,
} from "@/lib/playground/scenario-types";
import { validateScenarioFixtures } from "@/lib/playground/scenario-fixtures";
import { resolveScenarioFixtureReference } from "@/lib/playground/scenario-fixtures";

const ADDRESS_TYPES = new Set(["Address", "MuxedAddress"]);
const NUMERIC_TYPES = new Set([
  "i128",
  "u32",
  "u64",
  "i64",
  "Timepoint",
  "Duration",
]);

export function validateScenario(
  scenario: PlaygroundScenario,
): ScenarioValidationIssue[] {
  const issues: ScenarioValidationIssue[] = [];
  const component = getComponentBySlug(scenario.componentSlug);

  if (!component) {
    issues.push({
      path: "componentSlug",
      message: `unknown component: ${scenario.componentSlug}`,
    });
    return issues;
  }
  for (const message of validateScenarioFixtures(scenario, component)) {
    issues.push({ path: "fixtures", message });
  }

  const functions = new Map(
    (component.interface ?? [])
      .filter((fn) => fn.name !== "__constructor")
      .map((fn) => [fn.name, fn] as const),
  );
  const knownIdentities = new Set(playgroundIdentityOptions(component));
  const stepIds = new Set<string>();
  const seenStepIds = new Set<string>();
  const stepsById = new Map<string, ScenarioStep>();
  const stepIndexes = new Map<string, number>();

  scenario.steps.forEach((step, index) => {
    stepIds.add(step.id);
    stepsById.set(step.id, step);
    stepIndexes.set(step.id, index);
  });

  if (scenario.id.length === 0) {
    issues.push({ path: "id", message: "scenario id must not be empty" });
  }
  if (scenario.title.length === 0) {
    issues.push({ path: "title", message: "scenario title must not be empty" });
  }
  if (scenario.steps.length === 0) {
    issues.push({ path: "steps", message: "scenario must contain a step" });
  }
  if (scenario.clock) {
    for (const [name, value] of Object.entries(scenario.clock)) {
      if (!isNonNegativeInteger(value)) {
        issues.push({ path: `clock.${name}`, message: "clock values must be non-negative bounded integers" });
      }
    }
  }

  scenario.steps.forEach((step, index) => {
    const path = `steps[${index}]`;
    if (seenStepIds.has(step.id)) {
      issues.push({ path: `${path}.id`, message: `duplicate step id: ${step.id}` });
    }
    seenStepIds.add(step.id);
    if (step.kind === "clock") {
      if (!step.clock || step.method !== "" || step.args.length !== 0) {
        issues.push({ path, message: "clock steps require an empty method and no arguments" });
      } else if (!isNonNegativeInteger(step.clock.advanceBySeconds)) {
        issues.push({ path: `${path}.clock.advanceBySeconds`, message: "clock advancement must be a non-negative bounded integer" });
      }
      return;
    }
    const fn = functions.get(step.method);
    if (!fn) {
      issues.push({
        path: `${path}.method`,
        message: `unknown method for ${scenario.componentSlug}: ${step.method}`,
      });
      return;
    }

    if (step.args.length !== fn.params.length) {
      issues.push({
        path: `${path}.args`,
        message: `${step.method} expects ${fn.params.length} argument(s), got ${step.args.length}`,
      });
      return;
    }

    fn.params.forEach((param, paramIndex) => {
      const argument = step.args[paramIndex] as ScenarioArgument;
      if (typeof argument === "object" && argument !== null) {
        if ("fixture" in argument && typeof argument.fixture === "string") {
          const resolved = resolveScenarioFixtureReference(argument.fixture, scenario.fixtures);
          if (!resolved.ok) issues.push({ path: `${path}.args[${paramIndex}]`, message: resolved.error });
          else if (param.type !== "Bytes") issues.push({ path: `${path}.args[${paramIndex}]`, message: "Merkle fixture values currently resolve to Bytes parameters only" });
          return;
        }
        if (!isScenarioResultReference(argument)) {
          issues.push({
            path: `${path}.args[${paramIndex}]`,
            message: "argument object must be a result reference",
          });
        } else {
          const parsed = parseResultReference(argument.reference, [...stepIds]);
          if (!parsed.ok) {
            issues.push({
              path: `${path}.args[${paramIndex}]`,
              message: parsed.error.message,
            });
          } else {
            const sourceIndex = stepIndexes.get(parsed.stepId);
            const source = stepsById.get(parsed.stepId);
            if (sourceIndex === undefined || sourceIndex >= index) {
              issues.push({
                path: `${path}.args[${paramIndex}]`,
                message: `result reference must point to an earlier step: ${parsed.stepId}`,
              });
            } else {
              const sourceFn = functions.get(source?.method ?? "");
              if (!sourceFn?.returns) {
                issues.push({
                  path: `${path}.args[${paramIndex}]`,
                  message: `referenced step has no returned result: ${parsed.stepId}`,
                });
              } else if (
                parsed.path.length === 0 &&
                sourceFn.returns !== param.type
              ) {
                issues.push({
                  path: `${path}.args[${paramIndex}]`,
                  message: `referenced result type ${sourceFn.returns} cannot be encoded as ${param.type}`,
                });
              }
            }
          }
        }
        return;
      }
      if (
        ADDRESS_TYPES.has(param.type) &&
        typeof argument === "string" &&
        !knownIdentities.has(argument)
      ) {
        issues.push({
          path: `${path}.args[${paramIndex}]`,
          message: `address argument must reference a known identity or dependency: ${String(argument)}`,
        });
      }
    });

    if (step.comparison) {
      const source = stepsById.get(step.comparison.compareWith);
      const sourceIndex = stepIndexes.get(step.comparison.compareWith);
      if (!source || sourceIndex === undefined || sourceIndex >= index) {
        issues.push({
          path: `${path}.comparison.compareWith`,
          message: `comparison source must reference an earlier step: ${step.comparison.compareWith}`,
        });
      } else if (source.kind !== "observation") {
        issues.push({
          path: `${path}.comparison.compareWith`,
          message: "comparison source must be an observation step",
        });
      }

      if (step.kind !== "observation") {
        issues.push({
          path: `${path}.comparison`,
          message: "comparisons must be attached to observation steps",
        });
      }

      const sourceFn = source ? functions.get(source.method) : undefined;
      if (!fn.returns || !sourceFn?.returns) {
        issues.push({
          path: `${path}.comparison`,
          message: "comparison steps must observe returned values",
        });
      }

      if (
        (step.comparison.relation === "increased" ||
          step.comparison.relation === "decreased") &&
        (!NUMERIC_TYPES.has(fn.returns ?? "") ||
          !NUMERIC_TYPES.has(sourceFn?.returns ?? ""))
      ) {
        issues.push({
          path: `${path}.comparison.relation`,
          message: "numeric comparison relations require numeric return types",
        });
      }
    }
  });

  return issues;
}

function isNonNegativeInteger(value: unknown): boolean {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 && value <= 31_536_000;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return false;
  try { return BigInt(value) <= BigInt(31_536_000); } catch { return false; }
}

export function validateAllScenarios(
  scenarios: readonly PlaygroundScenario[],
): Map<string, ScenarioValidationIssue[]> {
  return new Map(
    scenarios.map((scenario) => [
      `${scenario.componentSlug}:${scenario.id}`,
      validateScenario(scenario),
    ]),
  );
}
