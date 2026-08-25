import type { FunctionSpec, StellarComponent } from "@/data/components";
import type {
  CallRequest,
  ConstructorRequest,
  ExecutionError,
  ExecutionStatus,
  ExecutionStep,
  PlaygroundResult,
} from "@/lib/playground/types";

export const ADMIN_IDENTITY = "admin";
export const IDENTITY_OPTIONS = ["admin", "user1", "user2"] as const;
export const ADDRESS_TYPES = new Set(["Address", "MuxedAddress"]);

export function defaultArgValue(
  param: FunctionSpec["params"][number],
  index: number,
  addressOptions: readonly string[] = IDENTITY_OPTIONS,
): string {
  if (ADDRESS_TYPES.has(param.type)) {
    if (addressOptions.includes(param.name)) return param.name;
    return index === 0 ? ADMIN_IDENTITY : "user1";
  }
  if (param.type === "i128") return "1000";
  return "";
}

export function signerFor(
  fn: FunctionSpec,
  args: string[],
): string | undefined {
  if (fn.authorization === "admin") return ADMIN_IDENTITY;
  if (fn.authorization === "first-address") {
    const index = fn.params.findIndex((param) => ADDRESS_TYPES.has(param.type));
    return index >= 0 ? args[index] : undefined;
  }
  return undefined;
}

export function callRequestFor(fn: FunctionSpec, args: string[]): CallRequest {
  const signer = signerFor(fn, args);
  return signer
    ? { fn: fn.name, args, signer }
    : { fn: fn.name, args };
}

/**
 * Human-readable authorization description for the sandbox UI. It describes the
 * operation generically (by the authorizing parameter name) rather than naming
 * the currently selected sandbox identity, which would wrongly imply a contract
 * role. For example, Payment's `pay` is authorized by its `from` address — it
 * has no admin — so we say "Authorized by the from address" and only note the
 * selected identity as supplementary context.
 */
export function authorizationSummary(
  fn: FunctionSpec,
  signer: string | undefined,
): string {
  if (fn.authorization === "admin") {
    return signer
      ? `Requires the contract administrator's authorization (currently ${signer}).`
      : `Requires the contract administrator's authorization.`;
  }
  if (fn.authorization === "first-address") {
    const index = fn.params.findIndex((param) => ADDRESS_TYPES.has(param.type));
    const paramName = index >= 0 ? fn.params[index].name : "sender";
    return signer
      ? `Authorized by the ${paramName} address (currently ${signer}).`
      : `Authorized by the ${paramName} address.`;
  }
  return "Requires no authorization.";
}

export function buildConstructorRequest(
  component: StellarComponent,
  configValues: Record<string, string>,
): ConstructorRequest {
  const constructor = (component.interface ?? []).find(
    (fn) => fn.name === "__constructor",
  );
  const args: ConstructorRequest = {};
  if (!constructor) return args;
  for (const param of constructor.params) {
    if (ADDRESS_TYPES.has(param.type)) {
      args[param.name] = ADMIN_IDENTITY;
    } else {
      args[param.name] = configValueForParam(param.name, configValues);
    }
  }
  return args;
}

function configValueForParam(
  paramName: string,
  configValues: Record<string, string>,
): string {
  const candidates = [
    paramName,
    paramName.toLowerCase(),
    paramName.replace(/s$/, ""),
    `${paramName}s`,
  ];
  return (
    candidates.map((key) => configValues[key]).find((value) => value !== undefined) ??
    ""
  );
}

export function callsForSteps(
  steps: ExecutionStep[],
  ops: FunctionSpec[],
): CallRequest[] {
  return steps
    .filter((step) => step.fn !== "__constructor")
    .map((step) => {
      const fn = ops.find((op) => op.name === step.fn);
      return fn
        ? callRequestFor(fn, step.args)
        : { fn: step.fn, args: step.args };
    });
}

export function errorStatus(error: ExecutionError): ExecutionStatus {
  return error.kind === "contract" ? "contract-error" : "runner-error";
}

export function applyExecution(
  result: PlaygroundResult,
  submitted: ExecutionStep[],
): ExecutionStep[] {
  if (!result.ok) {
    return submitted.map((step) =>
      step.status === "pending"
        ? {
            ...step,
            status: "api-error",
            error: { kind: result.error.kind, message: result.error.message },
          }
        : step,
    );
  }

  const calls = result.response.calls ?? [];
  let callIndex = 0;
  return submitted.map((step) => {
    if (step.fn === "__constructor") {
      return result.response.deployedContract
        ? { ...step, status: "ok", result: result.response.deployedContract }
        : step;
    }
    const outcome = calls[callIndex++];
    if (!outcome) return step;
    if (outcome.ok) return { ...step, status: "ok", result: outcome.result };
    const error: ExecutionError = outcome.error ?? { kind: "contract" };
    return { ...step, status: errorStatus(error), error };
  });
}