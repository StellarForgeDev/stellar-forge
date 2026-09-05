import type { FunctionSpec, StellarComponent } from "@/data/components";
import { getComponentByPackage } from "@/data/components";
import type {
  CallRequest,
  ConstructorRequest,
  ExecutionError,
  ExecutionStatus,
  ExecutionStep,
  PlaygroundResult,
  PlaygroundClock,
} from "@/lib/playground/types";
import type { PlaygroundScenario, ScenarioFixtures } from "@/lib/playground/scenario-types";

export const ADMIN_IDENTITY = "admin";
export const IDENTITY_OPTIONS = ["admin", "user1", "user2"] as const;
export const ADDRESS_TYPES = new Set(["Address", "MuxedAddress"]);


// A valid Stellar strkey (account/contract/muxed). Used to tell identity-name
// references apart from literal addresses that may appear in constructor args.
const STRKEY_PATTERN = /^[GC][A-Z2-7]{55}$|^[M][A-Z2-7]{55}$/;

function isLikelyStrkey(value: string): boolean {
  return STRKEY_PATTERN.test(value);
}

/**
 * Identity references mentioned by a component's catalog metadata, derived
 * generically (no component-specific branching). For every Address/MuxedAddress
 * constructor parameter whose `constructorArgs` value is a name (not a
 * dependency alias, not a literal strkey) we treat that value as an identity
 * reference. Dependency constructors are scanned the same way so a dependency
 * can reference its own identities (e.g. `admin`). The names remain ordinary
 * data; the platform never maps a name to a component.
 */
export function discoverIdentityNames(component: StellarComponent): string[] {
  const names = new Set<string>();
  const aliases = new Set((component.dependencies ?? []).map((d) => d.alias));

  const ctor = (component.interface ?? []).find((fn) => fn.name === "__constructor");
  for (const param of ctor?.params ?? []) {
    if (!ADDRESS_TYPES.has(param.type)) continue;
    const ref = component.constructorArgs?.[param.name];
    if (
      typeof ref === "string" &&
      ref.length > 0 &&
      !aliases.has(ref) &&
      !isLikelyStrkey(ref)
    ) {
      names.add(ref);
    }
  }

  for (const dep of component.dependencies ?? []) {
    const depComponent = getComponentByPackage(dep.package);
    const depCtor = depComponent?.interface?.find(
      (fn) => fn.name === "__constructor",
    );
    for (const param of depCtor?.params ?? []) {
      if (!ADDRESS_TYPES.has(param.type)) continue;
      const ref = dep.constructorArgs?.[param.name];
      if (typeof ref === "string" && ref.length > 0 && !isLikelyStrkey(ref)) {
        names.add(ref);
      }
    }
  }

  return [...names];
}

/**
 * Identity options offered in the Playground UI for a component: the base
 * default identities (kept for backwards compatibility) plus the identity
 * references discovered from the component and dependency metadata, plus
 * dependency aliases. Purely data-driven — no component-specific list.
 */
export function playgroundIdentityOptions(component: StellarComponent): string[] {
  const discovered = discoverIdentityNames(component);
  const aliases = (component.dependencies ?? []).map((d) => d.alias);
  return Array.from(new Set([...IDENTITY_OPTIONS, ...discovered, ...aliases]));
}

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
  args: readonly unknown[],
): string | undefined {
  if (fn.authorization === "admin") return ADMIN_IDENTITY;
  if (fn.authorization === "first-address") {
    const index = fn.params.findIndex((param) => ADDRESS_TYPES.has(param.type));
    const value = index >= 0 ? args[index] : undefined;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

export function callRequestFor(fn: FunctionSpec, args: readonly unknown[]): CallRequest {
  const signer = signerFor(fn, args);
  return signer
    ? { fn: fn.name, args: [...args], signer }
    : { fn: fn.name, args: [...args] };
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
  fixtures?: ScenarioFixtures,
): ConstructorRequest {
  const constructor = (component.interface ?? []).find(
    (fn) => fn.name === "__constructor",
  );
  const args: ConstructorRequest = {};
  if (!constructor) return args;
  // `constructorArgs` (not `constructor`) holds the catalog defaults so we
  // avoid colliding with the built-in `Object.prototype.constructor`.
  const defaults = component.constructorArgs ?? {};
  for (const param of constructor.params) {
    const source = defaults[param.name];
    if (source !== undefined) {
      // Catalog-driven default: an identity name, a dependency alias, or a
      // literal. The API route and sandbox-runner resolve identities and
      // aliases to addresses, so no Token-shaped "admin" assumption lives here.
      args[param.name] = source;
    } else if (ADDRESS_TYPES.has(param.type)) {
      args[param.name] = ADMIN_IDENTITY;
    } else {
      args[param.name] = configValueForParam(param.name, configValues);
    }
  }
  Object.assign(args, fixtures?.constructorValues ?? {});
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

/** Converts an ordered scenario prefix into generic runner clock events. */
export function clockForScenarioPrefix(
  scenario: PlaygroundScenario,
  inclusiveStep: number,
): PlaygroundClock | undefined {
  const advances: { beforeCall: number; seconds: string | number }[] = [];
  let callCount = 0;
  for (const step of scenario.steps.slice(0, inclusiveStep + 1)) {
    if (step.kind === "clock") {
      if (step.clock) advances.push({ beforeCall: callCount, seconds: step.clock.advanceBySeconds });
    } else {
      callCount += 1;
    }
  }
  if (!scenario.clock && advances.length === 0) return undefined;
  return {
    ...(scenario.clock?.initialLedgerTimestamp !== undefined ? { initialLedgerTimestamp: scenario.clock.initialLedgerTimestamp } : {}),
    ...(scenario.clock?.initialLedgerSequence !== undefined ? { initialLedgerSequence: scenario.clock.initialLedgerSequence } : {}),
    advances,
  };
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
