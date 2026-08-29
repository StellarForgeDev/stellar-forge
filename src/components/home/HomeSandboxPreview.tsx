"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StateBadge } from "@/components/ui/StateBadge";
import {
  getConfigDefaults,
  stellarComponents,
  orderComponents,
  type FunctionSpec,
  type StellarComponent,
} from "@/data/components";
import { buildConstructorRequest, callRequestFor } from "@/lib/playground/execution";
import { postPlaygroundRequest } from "@/lib/playground/client";

type Phase = "running" | "live" | "preview";

// The homepage may showcase ONE real component executing locally. The choice is
// catalog-driven: a component opts in via `demo`, otherwise we fall back to the
// first implemented component with a callable interface. The generic UI never
// embeds a specific slug, method name, or expected value.
function pickDemoComponent(): StellarComponent | undefined {
  return (
    stellarComponents.find((c) => c.demo) ??
    orderComponents(stellarComponents).find(
      (c) => c.capabilities.implemented && (c.interface?.length ?? 0) > 0,
    )
  );
}

function pickDemoMethod(component: StellarComponent): FunctionSpec | undefined {
  if (component.demo) {
    return component.interface?.find((fn) => fn.name === component.demo!.method);
  }
  return component.interface?.find(
    (fn) => fn.name !== "__constructor" && fn.params.length === 0,
  );
}

const demoComponent = pickDemoComponent();
const demoMethod = demoComponent ? pickDemoMethod(demoComponent) : undefined;
const expectedPreview = demoComponent?.demo?.preview ?? null;

function StepIcon({ pending }: { pending: boolean }) {
  if (pending) {
    return (
      <svg
        className="h-4 w-4 animate-spin motion-reduce:animate-none text-text-secondary"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
        />
      </svg>
    );
  }
  return (
    <svg
      className="h-4 w-4 text-tone-local"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function HomeSandboxPreview() {
  const [phase, setPhase] = useState<Phase>("running");
  const [resultValue, setResultValue] = useState<string | null>(expectedPreview);
  const started = useRef(false);

  async function runDemo() {
    if (demoComponent == null || demoMethod == null) {
      setResultValue(expectedPreview);
      setPhase("preview");
      return;
    }
    setPhase("running");
    const request = {
      componentSlug: demoComponent.slug,
      constructor: buildConstructorRequest(
        demoComponent,
        getConfigDefaults(demoComponent),
      ),
      calls: [callRequestFor(demoMethod, [])],
    };
    const result = await postPlaygroundRequest(request);
    const outcome = result.ok ? result.response.calls?.[0] : undefined;
    if (result.ok && outcome?.ok) {
      setResultValue(outcome.result == null ? "" : String(outcome.result));
      setPhase("live");
    } else {
      setResultValue(expectedPreview);
      setPhase("preview");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runDemo();
  }, []);

  const running = phase === "running";
  const stepRows = [
    { label: `Initialize ${demoComponent?.name ?? "contract"} contract`, pending: running },
    { label: `Execute ${demoMethod?.name ?? "method"}()`, pending: running },
  ];

  return (
    <Card className="font-mono text-xs" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border border-border" />
          <span className="h-2.5 w-2.5 rounded-full border border-border" />
          <span className="h-2.5 w-2.5 rounded-full border border-border" />
          <span className="ml-2 text-text-secondary">
            {demoComponent?.slug ?? "contract"} · local sandbox
          </span>
        </div>

        {phase === "live" ? (
          <StateBadge tone="local">Live · local</StateBadge>
        ) : phase === "preview" ? (
          <StateBadge tone="neutral">Preview</StateBadge>
        ) : null}
      </div>

      <div className="mt-5 space-y-3">
        {stepRows.map((step) => (
          <div
            key={step.label}
            className="flex items-center gap-3 rounded-default border border-border px-3 py-2.5"
          >
            <StepIcon pending={step.pending} />
            <span className="text-text-primary">{step.label}</span>
          </div>
        ))}

        <div className="flex items-center gap-3 rounded-default border border-tone-local/50 bg-tone-local/5 px-3 py-2.5">
          <StepIcon pending={running} />
          <span className="text-text-secondary">Result</span>
          <span className="ml-auto font-mono text-sm text-text-primary">
            {running
              ? "…"
              : `${demoMethod?.name ?? "method"}() → ${resultValue ?? "—"}`}
          </span>
        </div>
      </div>

      {phase === "preview" && (
        <p className="mt-4 border-t border-border pt-4 font-sans text-xs leading-relaxed text-text-secondary">
          Live sandbox not reachable in this environment — showing the expected
          local result. Open the Playground to run it for real.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="font-sans text-xs text-text-secondary">
          Real contract, executed locally.
        </span>

        <Button variant="secondary" onClick={() => void runDemo()} loading={running}>
          {running ? "Running…" : "Run again"}
        </Button>
      </div>
    </Card>
  );
}
