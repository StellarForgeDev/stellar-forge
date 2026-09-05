"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StateBadge } from "@/components/ui/StateBadge";
import type { FunctionSpec, StellarComponent } from "@/data/components";
import { postPlaygroundRequest } from "@/lib/playground/client";
import {
  buildConstructorRequest,
  callRequestFor,
  clockForScenarioPrefix,
} from "@/lib/playground/execution";
import {
  formatScenarioArgument,
  resolveScenarioArguments,
} from "@/lib/playground/scenario-references";
import {
  evaluateScenarioComparison,
  scenarioResultsEqual,
} from "@/lib/playground/scenario-comparison";
import type {
  GuidedStepResult,
  PlaygroundScenario,
} from "@/lib/playground/scenario-types";
import { validateScenario } from "@/lib/playground/scenario-validation";

function formatResult(result: unknown): string {
  if (result === undefined) return "—";
  if (result === null) return "null";
  if (
    typeof result === "string" ||
    typeof result === "number" ||
    typeof result === "boolean"
  ) {
    return String(result);
  }
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function functionFor(
  component: StellarComponent,
  method: string,
): FunctionSpec | undefined {
  return (component.interface ?? []).find((fn) => fn.name === method);
}

export function GuidedWorkflowPanel({
  component,
  configValues,
  scenarios,
}: {
  component: StellarComponent;
  configValues: Record<string, string>;
  scenarios: PlaygroundScenario[];
}) {
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? "");
  const [results, setResults] = useState<GuidedStepResult[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scenario =
    scenarios.find((candidate) => candidate.id === scenarioId) ?? scenarios[0];
  const validationIssues = useMemo(
    () => (scenario ? validateScenario(scenario) : []),
    [scenario],
  );
  const functionMap = useMemo(
    () =>
      new Map(
        (component.interface ?? []).map((fn) => [fn.name, fn] as const),
      ),
    [component.interface],
  );
  const stepIds = useMemo(
    () => scenario?.steps.map((step) => step.id) ?? [],
    [scenario],
  );

  if (!scenario) return null;

  function resetWorkflow() {
    if (running) return;
    setResults([]);
    setError(null);
  }

  function selectScenario(id: string) {
    if (running) return;
    setScenarioId(id);
    setResults([]);
    setError(null);
  }

  async function runNextStep() {
    if (running || validationIssues.length > 0) return;
    const failedIndex = results.findIndex(
      (result) =>
        result.status === "execution-failed" ||
        result.status === "reference-error",
    );
    const nextIndex = failedIndex >= 0 ? failedIndex : results.length;
    const nextStep = scenario.steps[nextIndex];
    if (!nextStep) return;

    const nextFunction = functionFor(component, nextStep.method);
    if (nextStep.kind !== "clock" && !nextFunction) return;

    setRunning(true);
    setError(null);
    function saveResult(result: GuidedStepResult) {
      setResults((previous) =>
        nextIndex < previous.length
          ? previous.map((current, index) =>
              index === nextIndex ? result : current,
            )
          : [...previous, result],
      );
    }
    const calls: ReturnType<typeof callRequestFor>[] = [];
    const callStepIndexes: number[] = [];
    for (const [index, step] of scenario.steps
      .slice(0, nextIndex + 1)
      .entries()) {
      if (step.kind === "clock") {
        continue;
      }
      const fn = functionFor(component, step.method);
      if (!fn) continue;
      const resolved = resolveScenarioArguments(step.args, results, stepIds, scenario.fixtures);
      if (!resolved.ok) {
        const message = `Could not resolve ${step.args
          .filter((arg) => typeof arg === "object" && arg !== null)
          .map((arg) => formatScenarioArgument(arg))
          .join(", ")}: ${resolved.error.message}`;
        setError(message);
        saveResult({
          scenarioStep: step,
          functionSpec: fn,
          args: step.args,
          status: "reference-error",
          error: message,
        });
        if (index !== nextIndex) {
          setError(`Could not replay step ${step.title}: ${resolved.error.message}`);
        }
        setRunning(false);
        return;
      }
      calls.push(callRequestFor(fn, resolved.values));
      callStepIndexes.push(index);
    }

    try {
      const response = await postPlaygroundRequest({
        componentSlug: component.slug,
        constructor: buildConstructorRequest(component, configValues, scenario.fixtures),
        calls,
        ...(scenario.fixtures?.identities
          ? { fixtureIdentities: scenario.fixtures.identities }
          : {}),
        ...(clockForScenarioPrefix(scenario, nextIndex)
          ? { clock: clockForScenarioPrefix(scenario, nextIndex) }
          : {}),
      });

      if (!response.ok) {
        setError(response.error.message);
        saveResult({
          scenarioStep: nextStep,
          functionSpec: nextFunction!,
          args: nextStep.args,
          status: "execution-failed",
          error: response.error.message,
        });
        return;
      }

      const outcomes = response.response.calls ?? [];
      if (nextStep.kind === "clock") {
        saveResult({
          scenarioStep: nextStep,
          functionSpec: { name: "local clock", params: [] },
          args: [],
          status: "complete",
          actual: nextStep.clock?.advanceBySeconds,
        });
        return;
      }
      const outcomeIndex = callStepIndexes.indexOf(nextIndex);
      const outcome = outcomeIndex >= 0 ? outcomes[outcomeIndex] : undefined;
      if (!outcome) {
        const message = "sandbox returned no result for the requested step";
        setError(message);
        saveResult({
          scenarioStep: nextStep,
          functionSpec: nextFunction!,
          args: nextStep.args,
          status: "execution-failed",
          error: message,
        });
        return;
      }

      if (!outcome.ok) {
        const message = outcome.error?.message ?? "contract call failed";
        setError(message);
        saveResult({
          scenarioStep: nextStep,
          functionSpec: nextFunction!,
          args: nextStep.args,
          status: "execution-failed",
          actual: outcome.result,
          error: message,
        });
        return;
      }

      const expectationMatched =
        nextStep.kind !== "observation" ||
        nextStep.expected === undefined ||
        scenarioResultsEqual(outcome.result, nextStep.expected);
      const sourceResult = nextStep.comparison
        ? results.find(
            (previous) =>
              previous.scenarioStep.id === nextStep.comparison?.compareWith,
          )
        : undefined;
      const comparisonResult =
        nextStep.comparison &&
        sourceResult?.actual !== undefined &&
        outcome.result !== undefined
          ? evaluateScenarioComparison(
              nextStep.comparison,
              sourceResult.actual,
              outcome.result,
            )
          : undefined;
      saveResult({
        scenarioStep: nextStep,
        functionSpec: nextFunction!,
        args: nextStep.args,
        status: expectationMatched ? "complete" : "expectation-mismatch",
        actual: outcome.result,
        expectationMatched,
        comparison: comparisonResult,
      });
    } finally {
      setRunning(false);
    }
  }

  const complete = results.length >= scenario.steps.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
            Guided workflow · local sandbox
          </p>
          <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-text-secondary">
            Runs the real contract WASM with deterministic prefix replay. Authorization
            is simulated locally; no wallet is required and no Testnet state changes.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <StateBadge tone="local">Local sandbox</StateBadge>
            <StateBadge tone="local">Real WASM</StateBadge>
            <StateBadge tone="neutral">Authorization simulated</StateBadge>
            <StateBadge tone="neutral">No wallet</StateBadge>
            <StateBadge tone="neutral">No Testnet state changed</StateBadge>
            {scenario.fixtures?.merkle && (
              <StateBadge tone="local">Deterministic local Merkle fixture</StateBadge>
            )}
            {scenario.fixtures?.oracle && (
              <StateBadge tone="local">Deterministic local signature fixture</StateBadge>
            )}
          </div>
        </div>
      </div>

      {scenarios.length > 1 && (
        <label className="block max-w-md">
          <span className="font-sans text-sm text-text-primary">Scenario</span>
          <select
            value={scenario.id}
            onChange={(event) => selectScenario(event.target.value)}
            disabled={running}
            className="mt-2 w-full rounded-default border border-border bg-surface px-3 py-2 font-mono text-sm text-text-primary"
          >
            {scenarios.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-text-secondary">
              {scenario.steps.length} steps
            </p>
            <h3 className="mt-2 font-display text-2xl font-medium text-text-primary">
              {scenario.title}
            </h3>
            <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-text-secondary">
              {scenario.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={resetWorkflow} disabled={running || results.length === 0}>
              Reset Workflow
            </Button>
            <Button
              variant="primary"
              onClick={() => void runNextStep()}
              disabled={running || complete || validationIssues.length > 0}
            >
              {running ? "Running…" : complete ? "Workflow complete" : "Run Next Step"}
            </Button>
          </div>
        </div>

        {validationIssues.length > 0 && (
          <div className="mt-5 rounded-default border border-tone-error/40 bg-tone-error/5 p-4">
            <p className="font-sans text-sm text-tone-error">
              This workflow definition is invalid and cannot run.
            </p>
            <ul className="mt-2 list-disc pl-5 font-mono text-xs text-text-secondary">
              {validationIssues.map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>
                  {issue.path}: {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-default border border-tone-error/40 bg-tone-error/5 p-4 font-sans text-sm text-tone-error">
            The requested step failed: {error}
          </div>
        )}

        <ol className="mt-6 space-y-4 border-t border-border pt-5">
          {scenario.steps.map((step, index) => {
            const result = results[index];
            const fn = functionMap.get(step.method);
            const isNext = index === results.length;
            const status = result?.status ?? (isNext ? "pending" : "pending");
            const tone =
              status === "complete"
                ? "success"
                : status === "expectation-mismatch" ||
                    status === "reference-error" ||
                    status === "execution-failed"
                  ? "error"
                  : "pending";

            return (
              <li key={step.id} className="rounded-default border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs uppercase tracking-wide text-text-secondary">
                      Step {index + 1} · {step.kind}
                    </p>
                    <h4 className="mt-1 font-display text-lg font-medium text-text-primary">
                      {step.title}
                    </h4>
                  </div>
                  <StateBadge tone={tone}>
                    {status === "complete"
                      ? "complete"
                      : status === "expectation-mismatch"
                        ? "expectation mismatch"
                      : status === "reference-error"
                        ? "reference error"
                        : status === "execution-failed"
                          ? "execution failed"
                          : "pending"}
                  </StateBadge>
                </div>

                <p className="mt-2 font-sans text-sm leading-relaxed text-text-secondary">
                  {step.explanation}
                </p>
                {step.kind === "clock" ? (
                  <p className="mt-3 font-mono text-xs text-accent-forge">
                    Local clock advanced by {step.clock?.advanceBySeconds ?? "0"} seconds
                  </p>
                ) : (
                  <p className="mt-3 break-words font-mono text-xs text-text-primary">
                    {step.method}({step.args.map(formatScenarioArgument).join(", ")})
                  </p>
                )}
                {step.authorization && (
                  <p className="mt-2 font-sans text-xs text-accent-forge">
                    Authorization simulated locally: {step.authorization}
                  </p>
                )}

                {result && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {step.expected !== undefined && (
                      <p className="font-mono text-xs text-text-secondary">
                        Expected:{" "}
                        <span className="text-text-primary">
                          {formatResult(step.expected)}
                          {step.resultLabel ? ` (${step.resultLabel})` : ""}
                        </span>
                      </p>
                    )}
                    {result.actual !== undefined && (
                      <p className="font-mono text-xs text-text-secondary">
                        Actual:{" "}
                        <span className="text-text-primary">
                          {formatResult(result.actual)}
                          {step.resultLabel ? ` (${step.resultLabel})` : ""}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {result?.status === "complete" && step.kind === "observation" && (
                  <p className="mt-3 font-sans text-xs text-tone-success">
                    ✓ Observation confirmed
                  </p>
                )}
                {result?.status === "complete" && step.kind === "call" && (
                  <p className="mt-3 font-sans text-xs text-tone-success">
                    ✓ Contract call succeeded
                  </p>
                )}
                {result?.status === "complete" && step.kind === "clock" && (
                  <p className="mt-3 font-sans text-xs text-tone-success">
                    ✓ Local time advanced; no network ledger changed
                  </p>
                )}
                {result?.status === "expectation-mismatch" && (
                  <p className="mt-3 font-sans text-xs text-tone-error">
                    The contract call succeeded, but the returned value did not match the expected result.
                  </p>
                )}
                {result?.error && (
                  <p className="mt-3 font-mono text-xs text-tone-error">
                    {result.error}
                  </p>
                )}
                {result?.status === "reference-error" && (
                  <p className="mt-3 font-sans text-xs text-tone-error">
                    This step was not sent to the contract because its referenced result was unavailable.
                  </p>
                )}
                {result?.comparison && (
                  <div className="mt-4 rounded-default border border-border bg-canvas/60 p-3">
                    <p className="font-mono text-xs uppercase tracking-wide text-text-secondary">
                      State comparison · {result.comparison.relation}
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <p className="font-mono text-xs text-text-secondary">
                        Before: <span className="text-text-primary">{formatResult(result.comparison.before)}</span>
                      </p>
                      <p className="font-mono text-xs text-text-secondary">
                        After: <span className="text-text-primary">{formatResult(result.comparison.after)}</span>
                      </p>
                      {result.comparison.delta !== undefined && (
                        <p className="font-mono text-xs text-text-secondary">
                          Delta: <span className="text-text-primary">{result.comparison.delta}</span>
                        </p>
                      )}
                    </div>
                    <p className={`mt-2 font-sans text-xs ${result.comparison.passed ? "text-tone-success" : "text-tone-error"}`}>
                      {result.comparison.passed
                        ? `✓ ${result.comparison.relation}`
                        : `Comparison failed: expected ${result.comparison.relation}`}
                    </p>
                  </div>
                )}
                {fn && result?.status === "complete" && fn.returns && (
                  <p className="mt-2 font-mono text-[11px] text-text-secondary">
                    Returns: {fn.returns}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
