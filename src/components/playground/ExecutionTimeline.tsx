"use client";

import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { LinkButton } from "@/components/ui/LinkButton";
import { StateBadge } from "@/components/ui/StateBadge";
import type {
  ExecutionError,
  ExecutionStep,
  PlaygroundResult,
} from "@/lib/playground/types";

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
  if (typeof result === "bigint") return result.toString();
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function formatError(error: ExecutionError | undefined): string {
  if (!error) return "no details";
  if (error.kind === "contract") {
    const details = error.code
      ? `${error.type ?? "Contract"}/${error.code}`
      : error.type ?? "contract error";
    return `contract error: ${details}`;
  }
  return `${error.kind} error: ${error.message ?? "no details"}`;
}

const STATUS_LABELS: Record<ExecutionStep["status"], string> = {
  pending: "pending",
  ok: "complete",
  "contract-error": "contract error",
  "runner-error": "runner error",
  "api-error": "api error",
};

function statusTone(
  status: ExecutionStep["status"],
): "success" | "pending" | "error" {
  if (status === "ok") return "success";
  if (status === "pending") return "pending";
  return "error";
}

function stepSummary(step: ExecutionStep): string | null {
  if (step.status === "ok") {
    if (step.fn === "__constructor") {
      return step.result != null
        ? `deployed at ${formatResult(step.result)}`
        : "initialized";
    }
    return `returned ${formatResult(step.result)}`;
  }
  if (step.status === "pending") return "executing…";
  return step.error ? formatError(step.error) : STATUS_LABELS[step.status];
}

export function ExecutionTimeline({
  steps,
  lastResponse,
  onRetry,
}: {
  steps: ExecutionStep[];
  lastResponse: PlaygroundResult | null;
  onRetry?: () => void;
}) {
  if (steps.length === 0) {
    return (
      <div className="mt-6 border-t border-border pt-5">
        <p className="font-mono text-xs uppercase tracking-wide text-text-secondary">
          Execution
        </p>

        <p className="mt-3 font-sans text-sm text-text-secondary">
          No operations executed yet. Initialize the contract to begin.
        </p>
      </div>
    );
  }

  const lastOk = [...steps]
    .reverse()
    .find((step) => step.status === "ok");
  const failures = steps.filter(
    (step) => step.status !== "ok" && step.status !== "pending",
  );
  const failed = failures.length > 0;

  const technicalDetails = failures
    .map((step) => {
      const detail = step.error
        ? formatError(step.error)
        : STATUS_LABELS[step.status];
      return `${step.label}\n${detail}`;
    })
    .join("\n\n");

  return (
    <div className="mt-6 border-t border-border pt-5">
      <p className="font-mono text-xs uppercase tracking-wide text-text-secondary">
        Execution
      </p>

      <ol className="mt-4">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const tone = statusTone(step.status);
          const summary = stepSummary(step);

          return (
            <li
              key={step.id}
              className="relative flex gap-3 pb-5 last:pb-0"
            >
              {!isLast && (
                <span
                  aria-hidden="true"
                  className="absolute left-[7px] top-4 h-full w-px bg-border"
                />
              )}

              <span
                aria-hidden="true"
                className={`relative mt-1 h-3.5 w-3.5 flex-none rounded-full border ${
                  tone === "success"
                    ? "border-tone-success bg-tone-success/25"
                    : tone === "pending"
                      ? "animate-pulse border-tone-pending bg-tone-pending/25 motion-reduce:animate-none"
                      : "border-tone-error bg-tone-error/25"
                }`}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="break-words font-mono text-sm text-text-primary">
                    {step.label}
                  </p>

                  <StateBadge tone={tone}>
                    {STATUS_LABELS[step.status]}
                  </StateBadge>
                </div>

                {summary && (
                  <p className="mt-1 font-sans text-xs text-text-secondary">
                    {summary}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {failed && (
        <div className="mt-2 rounded-default border border-tone-error/40 bg-tone-error/5 p-4">
          <p className="font-display text-base font-medium text-tone-error">
            Execution failed
          </p>

          <p className="mt-1 font-sans text-sm text-text-secondary">
            The contract call could not be completed.
          </p>

          {onRetry && (
            <div className="mt-3">
              <Button variant="secondary" onClick={onRetry}>
                Retry
              </Button>
            </div>
          )}

          <details className="mt-3">
            <summary className="cursor-pointer font-mono text-xs text-text-secondary">
              Technical details
            </summary>

            <pre className="mt-2 overflow-auto rounded-default border border-border bg-canvas/60 p-3 font-mono text-xs leading-relaxed text-text-secondary">
              {technicalDetails}
            </pre>
          </details>
        </div>
      )}

      {lastOk && (
        <div className="mt-5 rounded-default border border-tone-success/40 bg-tone-success/5 p-4">
          <p className="font-display text-base font-medium text-tone-success">
            Execution complete
          </p>

          <p className="mt-1 font-sans text-sm text-text-secondary">
            {lastOk.fn === "__constructor"
              ? "Contract initialized."
              : `${lastOk.fn}() returned`}
          </p>

          <p className="mt-2 break-words font-mono text-2xl text-text-primary">
            {formatResult(lastOk.result)}
          </p>

          <p className="mt-1 font-mono text-xs text-text-secondary">
            Returned from: {lastOk.fn}()
          </p>

          <div className="mt-3 flex flex-wrap gap-3">
            <CopyButton
              value={formatResult(lastOk.result)}
              label="Copy result"
              variant="secondary"
            />

            <LinkButton href="#integration" variant="secondary">
              View integration code →
            </LinkButton>
          </div>

          <p className="mt-3 font-sans text-xs text-text-secondary">
            Local simulated ledger — no Testnet transaction was submitted.
          </p>

          <details className="mt-3">
            <summary className="cursor-pointer font-mono text-xs text-text-secondary">
              Raw response
            </summary>

            <pre className="mt-2 overflow-auto rounded-default border border-border bg-canvas/60 p-3 font-mono text-xs leading-relaxed text-text-secondary">
              {lastResponse ? JSON.stringify(lastResponse, null, 2) : ""}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
