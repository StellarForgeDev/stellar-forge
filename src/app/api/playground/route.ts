import { execFile } from "node:child_process";
import {
  resolveRunner,
  resolveWasm,
} from "@/lib/playground/artifacts";
import {
  getComponentByPackage,
  getComponentBySlug,
  type FunctionSpec,
  type ParameterSpec,
  type StellarComponent,
} from "@/data/components";
import type { PlaygroundApiError, PlaygroundResponse } from "@/lib/playground/types";

export const runtime = "nodejs";

const RUNNER_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_CALLS = 20;
const MAX_IDENTITIES = 20;
const MAX_STRING_LENGTH = 100;
const MAX_SYMBOL_LENGTH = 32;

const DEFAULT_IDENTITIES: ReadonlySet<string> = new Set([
  "admin",
  "user1",
  "user2",
  "deployer",
]);
const ACCOUNT_STRKEY = /^[GC][A-Z2-7]{55}$/;
const MUXED_STRKEY = /^[GCM][A-Z2-7]{55}$/;
const INTEGER_STRING = /^-?\d+$/;
const DECIMAL_STRING = /^\d+$/;
const I128_MIN = BigInt("-170141183460469231731687303715884105728");
const I128_MAX = BigInt("170141183460469231731687303715884105727");
const U32_MAX = BigInt("4294967295");

type ArgKind = "address" | "muxed" | "i128" | "u32" | "string" | "symbol";

function argKindForType(type: string): ArgKind | null {
  switch (type) {
    case "Address":
      return "address";
    case "MuxedAddress":
      return "muxed";
    case "i128":
      return "i128";
    case "u32":
      return "u32";
    case "String":
      return "string";
    case "Symbol":
      return "symbol";
    default:
      return null;
  }
}

interface ValidatedRequest {
  component: StellarComponent;
  identities?: Record<string, string>;
  constructorParams: { name: string; type: string }[];
  constructor: Record<string, unknown>;
  calls: Record<string, unknown>[];
  dependencies: RunnerDependency[];
}

interface RunnerDependencySetup {
  fn: string;
  args: unknown[];
  params: { name: string; type: string }[];
  signer?: string;
}

interface RunnerDependency {
  alias: string;
  wasmPath: string;
  constructorParams: { name: string; type: string }[];
  constructor: Record<string, unknown>;
  setup?: RunnerDependencySetup[];
}

export async function POST(request: Request): Promise<Response> {
  const runner = resolveRunner();
  if (!runner) {
    return apiErrorResponse({
      kind: "api",
      message:
        "sandbox-runner executable not found. Build it with `pnpm sandbox:build` (locally) — the Vercel deployment builds it automatically.",
      status: 503,
    });
  }

  const raw = await request.text();
  if (raw.length === 0) {
    return apiErrorResponse(inputError("request body must be a JSON object"));
  }
  if (raw.length > MAX_BODY_BYTES) {
    return apiErrorResponse({
      kind: "input",
      message: `request body exceeds ${MAX_BODY_BYTES} bytes`,
      status: 413,
    });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return apiErrorResponse(inputError("request body is not valid JSON"));
  }

  const validated = validateRequest(body);
  if ("error" in validated) {
    return apiErrorResponse(validated.error);
  }

  const component = validated.value.component;
  const wasm = resolveWasm(component);
  if (!wasm) {
    return apiErrorResponse({
      kind: "api",
      message: `contract wasm artifact not found for component "${component.slug}". Build it with \`pnpm sandbox:build\` (locally) or restore the prebuilt artifact in contracts/prebuilt/`,
      status: 503,
    });
  }

  const runnerRequest = {
    wasmPath: wasm.path,
    ...(validated.value.identities !== undefined
      ? { identities: validated.value.identities }
      : {}),
    constructorParams: validated.value.constructorParams,
    constructor: validated.value.constructor,
    calls: validated.value.calls,
    ...(validated.value.dependencies.length > 0
      ? { dependencies: validated.value.dependencies }
      : {}),
  };

  const result = await runRunner(JSON.stringify(runnerRequest));

  if (result.killed) {
    return apiErrorResponse({
      kind: "runner",
      message: `sandbox-runner timed out after ${RUNNER_TIMEOUT_MS / 1000}s`,
      status: 504,
    });
  }

  const parsed = parseRunnerStdout(result.stdout);
  if (result.exitCode !== 0) {
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { ok?: unknown }).ok === false
    ) {
      return Response.json(parsed as PlaygroundResponse, { status: 502 });
    }
    return apiErrorResponse({
      kind: "runner",
      message: `sandbox-runner exited with code ${result.exitCode}`,
      status: 502,
    });
  }
  if (parsed === undefined) {
    return apiErrorResponse({
      kind: "runner",
      message: "sandbox-runner returned an empty or invalid JSON response",
      status: 502,
    });
  }
  return Response.json(parsed, { status: 200 });
}

function validateRequest(
  body: unknown,
): { value: ValidatedRequest } | { error: PlaygroundApiError } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: inputError("request body must be a JSON object") };
  }
  const request = body as Record<string, unknown>;
  if ("wasmPath" in request) {
    return { error: inputError("wasmPath is not accepted from the browser") };
  }

  if (typeof request.componentSlug !== "string" || request.componentSlug.length === 0) {
    return { error: inputError("request must include a componentSlug") };
  }
  const component = getComponentBySlug(request.componentSlug);
  if (!component) {
    return { error: inputError(`unknown component: ${request.componentSlug}`) };
  }
  if (!component.implementation) {
    return {
      error: inputError(`component ${component.slug} has no implementation metadata`),
    };
  }
  const constructorFn = (component.interface ?? []).find(
    (fn) => fn.name === "__constructor",
  );
  if (!constructorFn) {
    return {
      error: inputError(`component ${component.slug} has no constructor interface`),
    };
  }
  const interfaceByName = new Map(
    (component.interface ?? [])
      .filter((fn) => fn.name !== "__constructor")
      .map((fn) => [fn.name, fn] as const),
  );

  let identities: Record<string, string> | undefined;
  if ("identities" in request) {
    const checked = validateIdentities(request.identities);
    if ("error" in checked) return checked;
    identities = checked.value;
  }

  const knownNames = new Set(DEFAULT_IDENTITIES);
  if (identities !== undefined) {
    for (const name of Object.keys(identities)) knownNames.add(name);
  }
  // Dependency aliases resolve to addresses, so calls may reference them.
  for (const alias of (component.dependencies ?? []).map((d) => d.alias)) {
    knownNames.add(alias);
  }

  const constructor = validateConstructor(
    request.constructor,
    constructorFn.params,
    knownNames,
  );
  if ("error" in constructor) return constructor;

  const calls = request.calls;
  if (!Array.isArray(calls) || calls.length > MAX_CALLS) {
    return {
      error: inputError(
        `calls must be an array of 0 to ${MAX_CALLS} operations`,
      ),
    };
  }
  const checkedCalls: Record<string, unknown>[] = [];
  for (const call of calls) {
    const checked = validateCall(call, interfaceByName, knownNames);
    if ("error" in checked) return checked;
    const spec = interfaceByName.get(checked.value.fn as string);
    checkedCalls.push({
      ...checked.value,
      params: (spec?.params ?? []).map((param) => ({
        name: param.name,
        type: param.type,
      })),
    });
  }

  const dependencies = buildRunnerDependencies(component, knownNames);
  if ("error" in dependencies) return dependencies;

  return {
    value: {
      component,
      ...(identities !== undefined ? { identities } : {}),
      constructorParams: constructorFn.params.map((param) => ({
        name: param.name,
        type: param.type,
      })),
      constructor: constructor.value,
      calls: checkedCalls,
      dependencies: dependencies.value,
    },
  };
}

function apiError(message: string): PlaygroundApiError {
  return { kind: "api", message, status: 503 };
}

function buildRunnerDependencies(
  component: StellarComponent,
  knownNames: Set<string>,
): { value: RunnerDependency[] } | { error: PlaygroundApiError } {
  const deps = component.dependencies ?? [];
  const out: RunnerDependency[] = [];
  for (const dep of deps) {
    if (dep.alias.length === 0 || dep.alias.length > 32) {
      return { error: inputError(`dependency alias is invalid: ${dep.alias}`) };
    }
    const depComponent = getComponentByPackage(dep.package);
    if (!depComponent || !depComponent.implementation) {
      return { error: inputError(`unknown dependency package: ${dep.package}`) };
    }
    const wasm = resolveWasm(depComponent);
    if (!wasm) {
      return {
        error: apiError(
          `contract wasm artifact not found for dependency "${dep.alias}" (${dep.package}). Build it with \`pnpm sandbox:build\` (locally) or restore the prebuilt artifact in contracts/prebuilt/`,
        ),
      };
    }
    const ctorFn = (depComponent.interface ?? []).find(
      (fn) => fn.name === "__constructor",
    );
    if (!ctorFn) {
      return {
        error: inputError(`dependency ${dep.package} has no constructor interface`),
      };
    }
    const provided = dep.constructor ?? {};
    const constructorValue: Record<string, unknown> = {};
    for (const param of ctorFn.params) {
      if (!(param.name in provided)) {
        return {
          error: inputError(
            `dependency ${dep.alias} is missing constructor parameter ${param.name}`,
          ),
        };
      }
      constructorValue[param.name] = provided[param.name];
    }
    const checked = validateConstructor(constructorValue, ctorFn.params, knownNames);
    if ("error" in checked) return checked;

    const depInterface = new Map(
      (depComponent.interface ?? [])
        .filter((fn) => fn.name !== "__constructor")
        .map((fn) => [fn.name, fn] as const),
    );
    const setup: RunnerDependencySetup[] = [];
    for (const call of dep.setup ?? []) {
      const checkedCall = validateCall(call, depInterface, knownNames);
      if ("error" in checkedCall) return checkedCall;
      const spec = depInterface.get(call.fn);
      setup.push({
        fn: call.fn,
        args: call.args,
        ...(call.signer !== undefined ? { signer: call.signer } : {}),
        params: (spec?.params ?? []).map((p) => ({ name: p.name, type: p.type })),
      });
    }

    out.push({
      alias: dep.alias,
      wasmPath: wasm.path,
      constructorParams: ctorFn.params.map((p) => ({ name: p.name, type: p.type })),
      constructor: checked.value,
      ...(setup.length > 0 ? { setup } : {}),
    });
  }
  return { value: out };
}

function validateIdentities(
  value: unknown,
): { value: Record<string, string> } | { error: PlaygroundApiError } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      error: inputError(
        "identities must be an object mapping names to strkeys",
      ),
    };
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_IDENTITIES) {
    return {
      error: inputError(`identities exceeds ${MAX_IDENTITIES} entries`),
    };
  }
  const result: Record<string, string> = {};
  for (const [name, key] of entries) {
    if (name.length === 0 || name.length > 32) {
      return { error: inputError(`invalid identity name: ${name}`) };
    }
    if (typeof key !== "string" || !MUXED_STRKEY.test(key)) {
      return { error: inputError(`identity ${name} must be a G/C/M strkey`) };
    }
    result[name] = key;
  }
  return { value: result };
}

function validateConstructor(
  value: unknown,
  params: ParameterSpec[],
  knownNames: Set<string>,
): { value: Record<string, unknown> } | { error: PlaygroundApiError } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: inputError("constructor must be an object") };
  }
  const ctor = value as Record<string, unknown>;
  for (const param of params) {
    const kind = argKindForType(param.type);
    if (kind === null) {
      return {
        error: inputError(
          `constructor parameter ${param.name} has unsupported type ${param.type}`,
        ),
      };
    }
    if (!isValidArg(kind, ctor[param.name], knownNames)) {
      return {
        error: inputError(
          `constructor.${param.name} must be ${describeArgKind(kind)}`,
        ),
      };
    }
  }
  return { value: ctor };
}

function validateCall(
  value: unknown,
  interfaceByName: ReadonlyMap<string, FunctionSpec>,
  knownNames: Set<string>,
): { value: Record<string, unknown> } | { error: PlaygroundApiError } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: inputError("each call must be an object") };
  }
  const call = value as Record<string, unknown>;
  const fn = call.fn;
  if (typeof fn !== "string") {
    return { error: inputError("call.fn must be a function name") };
  }
  const spec = interfaceByName.get(fn);
  if (!spec) {
    return { error: inputError(`unsupported function: ${fn}`) };
  }
  const args = call.args;
  if (!Array.isArray(args) || args.length !== spec.params.length) {
    const got = Array.isArray(args) ? args.length : "non-array";
    return {
      error: inputError(
        `${fn} expects ${spec.params.length} argument(s), got ${got}`,
      ),
    };
  }
  for (let i = 0; i < args.length; i++) {
    const kind = argKindForType(spec.params[i].type);
    if (kind === null) {
      return {
        error: inputError(
          `${fn} argument ${i} has unsupported type ${spec.params[i].type}`,
        ),
      };
    }
    if (!isValidArg(kind, args[i], knownNames)) {
      return {
        error: inputError(
          `${fn} argument ${i} must be ${describeArgKind(kind)}`,
        ),
      };
    }
  }
  const signer = call.signer;
  if (signer !== undefined && !isAddressRef(signer, knownNames, false)) {
    return {
      error: inputError("signer must be a known identity or a G/C strkey"),
    };
  }
  const requiresSigner =
    spec.authorization === "admin" || spec.authorization === "first-address";
  if (requiresSigner && signer === undefined) {
    return { error: inputError(`${fn} requires a signer`) };
  }
  return { value: call };
}

function isValidArg(
  kind: ArgKind,
  value: unknown,
  knownNames: Set<string>,
): boolean {
  switch (kind) {
    case "address":
      return isAddressRef(value, knownNames, false);
    case "muxed":
      return isAddressRef(value, knownNames, true);
    case "i128":
      return isI128(value);
    case "u32":
      return isU32(value);
    case "string":
      return isBoundedString(value, MAX_STRING_LENGTH);
    case "symbol":
      return isBoundedString(value, MAX_SYMBOL_LENGTH);
  }
}

function describeArgKind(kind: ArgKind): string {
  switch (kind) {
    case "address":
      return "an identity name or G/C strkey";
    case "muxed":
      return "an identity name or G/C/M strkey";
    case "i128":
      return "an integer (number or string)";
    case "u32":
      return "an unsigned 32-bit integer (number or string)";
    case "string":
      return "a non-empty string of at most 100 characters";
    case "symbol":
      return "a non-empty symbol of at most 32 characters";
  }
}

function isAddressRef(
  value: unknown,
  knownNames: Set<string>,
  muxed: boolean,
): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  if (knownNames.has(value)) return true;
  return muxed ? MUXED_STRKEY.test(value) : ACCOUNT_STRKEY.test(value);
}

function isI128(value: unknown): boolean {
  if (typeof value === "number") {
    return (
      Number.isInteger(value) &&
      value >= Number.MIN_SAFE_INTEGER &&
      value <= Number.MAX_SAFE_INTEGER
    );
  }
  if (typeof value === "string" && INTEGER_STRING.test(value)) {
    try {
      const n = BigInt(value);
      return n >= I128_MIN && n <= I128_MAX;
    } catch {
      return false;
    }
  }
  return false;
}

function isU32(value: unknown): boolean {
  if (typeof value === "number") {
    return (
      Number.isInteger(value) && value >= 0 && value <= 4_294_967_295
    );
  }
  if (typeof value === "string" && DECIMAL_STRING.test(value)) {
    try {
      const n = BigInt(value);
      return n >= BigInt(0) && n <= U32_MAX;
    } catch {
      return false;
    }
  }
  return false;
}

function isBoundedString(value: unknown, max: number): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function runRunner(
  input: string,
): Promise<{ exitCode: number; stdout: string; killed: boolean }> {
  const runner = resolveRunner();
  if (!runner) {
    return Promise.resolve({ exitCode: 1, stdout: "", killed: false });
  }

  return new Promise((resolve) => {
    const child = execFile(
      runner.path,
      [],
      {
        timeout: RUNNER_TIMEOUT_MS,
        maxBuffer: 1_000_000,
        windowsHide: true,
        encoding: "utf8",
      },
      (error, stdout) => {
        if (error) {
          const exitCode = typeof error.code === "number" ? error.code : 1;
          resolve({ exitCode, stdout, killed: error.killed === true });
        } else {
          resolve({ exitCode: 0, stdout, killed: false });
        }
      },
    );
    child.stdin?.end(input);
  });
}

function parseRunnerStdout(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function inputError(message: string): PlaygroundApiError {
  return { kind: "input", message, status: 400 };
}

function apiErrorResponse(error: PlaygroundApiError): Response {
  const body: PlaygroundResponse = {
    ok: false,
    error: { kind: error.kind, message: error.message },
  };
  return Response.json(body, { status: error.status });
}