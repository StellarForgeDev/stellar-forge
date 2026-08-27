"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StateBadge } from "@/components/ui/StateBadge";
import { ExecutionTimeline } from "@/components/playground/ExecutionTimeline";
import type { FunctionSpec, StellarComponent } from "@/data/components";
import { postPlaygroundRequest } from "@/lib/playground/client";
import {
  ADDRESS_TYPES,
  applyExecution,
  authorizationSummary,
  buildConstructorRequest,
  callsForSteps,
  defaultArgValue,
  playgroundIdentityOptions,
  signerFor,
} from "@/lib/playground/execution";
import type { ExecutionStep, PlaygroundResult } from "@/lib/playground/types";

const INTEGER_PATTERN = /^-?\d+$/;
const DECIMAL_PATTERN = /^\d+$/;
const I128_MIN = BigInt("-170141183460469231731687303715884105728");
const I128_MAX = BigInt("170141183460469231731687303715884105727");
const U32_MAX = BigInt("4294967295");

let nextStepId = 1;

function stepLabel(fn: FunctionSpec, args: string[]): string {
  return `${fn.name}(${args.join(", ")})`;
}

function validateParamValue(
  param: FunctionSpec["params"][number],
  value: string,
): string | null {
  if (value.trim().length === 0) return null;
  if (param.type === "i128") {
    if (!INTEGER_PATTERN.test(value)) return "must be an integer";
    const n = BigInt(value);
    if (n < I128_MIN || n > I128_MAX) return "outside the i128 range";
    return null;
  }
  if (param.type === "u32") {
    if (!DECIMAL_PATTERN.test(value)) return "must be a whole number";
    if (BigInt(value) > U32_MAX) return "outside the u32 range";
    return null;
  }
  return null;
}

export function SandboxPanel({
  component,
  configValues,
  method,
}: {
  component: StellarComponent;
  configValues: Record<string, string>;
  method?: string;
}) {
  const ops = (component.interface ?? []).filter(
    (fn) => fn.name !== "__constructor",
  );
  const dependencyAliases = (component.dependencies ?? []).map((d) => d.alias);
  const addressOptions = playgroundIdentityOptions(component);
  const identityOptionsOnly = addressOptions.filter(
    (option) => !dependencyAliases.includes(option),
  );
  const initialOpName =
    method && ops.some((op) => op.name === method)
      ? method
      : ops[0]?.name ?? "";

  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [opName, setOpName] = useState(initialOpName);
  const [argValues, setArgValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (ops.find((op) => op.name === initialOpName)?.params ?? []).map(
        (param, index) => [
          param.name,
          defaultArgValue(param, index, addressOptions),
        ],
      ),
    ),
  );
  const [initializing, setInitializing] = useState(false);
  const [running, setRunning] = useState(false);
  const [deployedContract, setDeployedContract] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PlaygroundResult | null>(null);
  const [lastAction, setLastAction] = useState<"init" | "execute" | null>(
    null,
  );

  if (ops.length === 0) return null;

  const busy = initializing || running;
  const selectedOp = ops.find((op) => op.name === opName) ?? ops[0];
  const args = selectedOp.params.map((param) => argValues[param.name] ?? "");
  const hasEmptyArgs = args.some((value) => value.trim().length === 0);
  const argErrors = Object.fromEntries(
    selectedOp.params.map((param) => [
      param.name,
      validateParamValue(param, argValues[param.name] ?? ""),
    ]),
  );
  const hasInvalidArgs = Object.values(argErrors).some(
    (message) => message !== null,
  );
  const signer = signerFor(selectedOp, args);

  function changeOp(name: string) {
    const fn = ops.find((op) => op.name === name);
    if (!fn) return;
    setOpName(name);
    setArgValues(
      Object.fromEntries(
        fn.params.map((param, index) => [
          param.name,
          defaultArgValue(param, index, addressOptions),
        ]),
      ),
    );
  }

  async function initialize() {
    if (busy) return;
    setInitializing(true);
    setLastAction("init");
    const constructorParams =
      (component.interface ?? []).find((fn) => fn.name === "__constructor")
        ?.params ?? [];
    const initArgs = buildConstructorRequest(component, configValues);
    const step: ExecutionStep = {
      id: nextStepId++,
      fn: "__constructor",
      label: `initialize(${constructorParams
        .map((param) => String(initArgs[param.name] ?? ""))
        .join(", ")})`,
      args: [],
      status: "pending",
    };
    setSteps([step]);
    setDeployedContract(null);
    try {
      const result = await postPlaygroundRequest({
        componentSlug: component.slug,
        constructor: initArgs,
        calls: [],
      });
      setLastResult(result);
      if (result.ok) {
        setDeployedContract(result.response.deployedContract ?? null);
      }
      setSteps(applyExecution(result, [step]));
    } finally {
      setInitializing(false);
    }
  }

  function retry() {
    if (lastAction === "init") void initialize();
    else if (lastAction === "execute") void execute();
  }

  async function execute() {
    if (busy || hasEmptyArgs || hasInvalidArgs) return;
    setRunning(true);
    setLastAction("execute");
    const step: ExecutionStep = {
      id: nextStepId++,
      fn: selectedOp.name,
      label: stepLabel(selectedOp, args),
      args,
      status: "pending",
    };
    const submitted = [...steps, step];
    setSteps(submitted);
    try {
      const result = await postPlaygroundRequest({
        componentSlug: component.slug,
        constructor: buildConstructorRequest(component, configValues),
        calls: callsForSteps(submitted, ops),
      });
      setLastResult(result);
      if (result.ok) {
        setDeployedContract(result.response.deployedContract ?? null);
      }
      setSteps(applyExecution(result, submitted));
    } finally {
      setRunning(false);
    }
  }

  function resetSandbox() {
    setSteps([]);
    setDeployedContract(null);
  }

  function renderParamInput(param: FunctionSpec["params"][number]) {
    const inputStyles =
      "mt-2 w-full rounded-default border border-border bg-surface px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar disabled:cursor-not-allowed disabled:opacity-50";

    if (ADDRESS_TYPES.has(param.type)) {
      const isDependency = dependencyAliases.includes(param.name);
      return (
        <div>
          <select
            value={argValues[param.name] ?? ""}
            onChange={(event) =>
              setArgValues({ ...argValues, [param.name]: event.target.value })
            }
            disabled={busy}
            className={inputStyles}
          >
            <optgroup label="Identities">
              {identityOptionsOnly.map((identity) => (
                <option key={identity} value={identity}>
                  {identity}
                </option>
              ))}
            </optgroup>
            {dependencyAliases.length > 0 && (
              <optgroup label="Dependencies (auto-provisioned)">
                {dependencyAliases.map((alias) => (
                  <option key={alias} value={alias}>
                    {alias}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {isDependency && (
            <p className="mt-1 font-sans text-xs text-text-secondary">
              Resolves to the auto-provisioned “{param.name}” dependency contract
              deployed alongside this component in the sandbox.
            </p>
          )}
        </div>
      );
    }

    return (
      <input
        type="text"
        inputMode={param.type === "i128" || param.type === "u32" ? "numeric" : "text"}
        value={argValues[param.name] ?? ""}
        onChange={(event) =>
          setArgValues({ ...argValues, [param.name]: event.target.value })
        }
        placeholder={param.type === "u32" ? "whole number" : "amount"}
        disabled={busy}
        aria-invalid={argErrors[param.name] !== null}
        className={inputStyles}
      />
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
            Sandbox — local simulated ledger
          </p>

          <p className="mt-2 max-w-xl font-sans text-sm leading-relaxed text-text-secondary">
            Executes {component.name} locally: the real contract wasm runs in an
            isolated Soroban host on this machine, replaying the full operation
            history in a fresh simulated ledger on every run. The selected
            network does not apply to local execution.
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <StateBadge tone="local">Local sandbox</StateBadge>
            <StateBadge tone="local">Fresh ledger</StateBadge>
            <StateBadge tone="neutral">No Testnet</StateBadge>
            <StateBadge tone="neutral">No wallet</StateBadge>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-default border border-border bg-canvas/60 px-3 py-2 font-mono text-xs">
        {deployedContract ? (
          <>
            <span className="text-text-secondary">deployed contract </span>
            <span className="break-all text-text-primary">
              {deployedContract}
            </span>
          </>
        ) : (
          <span className="text-text-secondary">
            not initialized. Initialize to deploy {component.name}
          </span>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="primary" onClick={initialize} disabled={busy}>
          {initializing ? "Initializing…" : `Initialize ${component.name}`}
        </Button>

        <Button
          variant="secondary"
          onClick={resetSandbox}
          disabled={busy || steps.length === 0}
        >
          Reset Sandbox
        </Button>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <p className="font-mono text-xs uppercase tracking-wide text-text-secondary">
          Execute operation
        </p>

        <p className="mt-2 break-words font-mono text-sm text-text-primary">
          {selectedOp.name}(
          {selectedOp.params.map((param) => param.name).join(", ")})
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block min-w-40">
            <span className="font-sans text-sm text-text-primary">
              Operation
            </span>

            <select
              value={opName}
              onChange={(event) => changeOp(event.target.value)}
              disabled={busy}
              className="mt-2 w-full rounded-default border border-border bg-surface px-3 py-2 font-mono text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ops.map((op) => (
                <option key={op.name} value={op.name}>
                  {op.name}
                </option>
              ))}
            </select>
          </label>

          {selectedOp.params.map((param) => (
            <label key={param.name} className="block min-w-36">
              <span className="font-sans text-sm text-text-primary">
                {param.name}{" "}
                <span className="font-mono text-xs text-text-secondary">
                  {param.type}
                </span>
              </span>

              {renderParamInput(param)}

              {argErrors[param.name] && (
                <span className="mt-1 block font-mono text-xs text-accent-forge">
                  {argErrors[param.name]}
                </span>
              )}
            </label>
          ))}

          <Button
            variant="primary"
            onClick={execute}
            disabled={busy || hasEmptyArgs || hasInvalidArgs}
          >
            {running ? "Executing…" : "Execute"}
          </Button>
        </div>

        {selectedOp.description && (
          <p className="mt-2 max-w-2xl font-sans text-xs leading-relaxed text-text-secondary">
            {selectedOp.description}
          </p>
        )}

        <p className="mt-2 font-sans text-xs text-text-secondary">
          {authorizationSummary(selectedOp, signer)}
        </p>
      </div>

      <ExecutionTimeline
        steps={steps}
        lastResponse={lastResult}
        onRetry={retry}
      />
    </Card>
  );
}