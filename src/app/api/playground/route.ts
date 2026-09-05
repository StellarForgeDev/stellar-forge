import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import {
  resolveRunner,
  resolveWasm,
} from "@/lib/playground/artifacts";
import { discoverIdentityNames } from "@/lib/playground/execution";
import {
  getComponentByPackage,
  getComponentBySlug,
  type FunctionSpec,
  type ParameterSpec,
  type StellarComponent,
} from "@/data/components";
import type { PlaygroundApiError, PlaygroundResponse } from "@/lib/playground/types";
import {
  describeParameterType,
  parseParameterType,
  type ParameterType,
} from "@/lib/transactions/parameter-types";

export const runtime = "nodejs";

const RUNNER_TIMEOUT_MS = 10_000;
const MAX_CONCURRENT_EXECUTIONS = 2;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_CALLS = 20;
const MAX_IDENTITIES = 20;
const MAX_STRING_LENGTH = 100;
const MAX_SYMBOL_LENGTH = 32;
const MAX_CLOCK_ADVANCE_SECONDS = 31_536_000;

const DEFAULT_IDENTITIES: ReadonlySet<string> = new Set([
  "admin",
  "user1",
  "user2",
  "deployer",
]);
const INTEGER_STRING = /^-?\d+$/;
const DECIMAL_STRING = /^\d+$/;
const HEX_STRING = /^(0x)?[0-9a-fA-F]*$/;
const I128_MIN = BigInt("-170141183460469231731687303715884105728");
const I128_MAX = BigInt("170141183460469231731687303715884105727");
const U32_MAX = BigInt("4294967295");
const U64_MAX = BigInt(2) ** BigInt(64) - BigInt(1);
const I64_MIN = BigInt("-9223372036854775808");
const I64_MAX = BigInt("9223372036854775807");

// This is intentionally process-local. It protects one Node.js instance from
// launching an unbounded number of native runners; deployment-wide admission
// control still belongs to the hosting layer.
let activeExecutions = 0;

export function tryAcquirePlaygroundExecution(): (() => void) | null {
  if (activeExecutions >= MAX_CONCURRENT_EXECUTIONS) return null;
  activeExecutions += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeExecutions -= 1;
  };
}

// Maps a declared parameter type to its Playground API argument category.
// Composite types (Vec/Map/Option) are supported generically via the shared
// parameter-type parser — there is no component-specific branching.
export function argKindForType(type: string): string | null {
  const ast = parseParameterType(type);
  return ast ? argKindForAST(ast) : null;
}

function argKindForAST(t: ParameterType): string {
  if (typeof t === "string") {
    switch (t) {
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
      case "bool":
        return "bool";
      case "u64":
        return "u64";
      case "i64":
        return "i64";
      case "Timepoint":
        return "timepoint";
      case "Duration":
        return "duration";
      case "Bytes":
        return "bytes";
    }
  }
  switch (t.kind) {
    case "Vec":
      return "vec";
    case "Map":
      return "map";
    case "Option":
      return "option";
  }
}

interface ValidatedRequest {
  component: StellarComponent;
  identities?: Record<string, string>;
  fixtureIdentities?: string[];
  constructorParams: { name: string; type: string }[];
  constructor: Record<string, unknown>;
  calls: Record<string, unknown>[];
  dependencies: RunnerDependency[];
  clock?: RunnerClock;
}

interface RunnerClock {
  initialLedgerTimestamp?: string | number;
  initialLedgerSequence?: string | number;
  advances: { beforeCall: number; seconds: string | number }[];
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
  try {
    return await handlePlaygroundPost(request);
  } catch {
    // Keep unexpected route failures safe for callers. The detailed exception
    // is intentionally not logged because it may contain paths or host data.
    logPlaygroundEvent("unexpected_route_failure");
    return apiErrorResponse({
      kind: "api",
      message: "sandbox service encountered an unexpected error",
      status: 500,
    });
  }
}

async function handlePlaygroundPost(request: Request): Promise<Response> {
  const runner = resolveRunner();
  if (!runner) {
    logPlaygroundEvent("runner_unavailable");
    return apiErrorResponse({
      kind: "api",
      message:
        "sandbox-runner executable not found. Build it with `pnpm sandbox:build` (locally) — the Vercel deployment builds it automatically.",
      status: 503,
    });
  }

  let bodyRead: Awaited<ReturnType<typeof readRequestBody>>;
  try {
    bodyRead = await readRequestBody(request);
  } catch {
    logPlaygroundEvent("request_body_read_failed");
    return apiErrorResponse(inputError("request body could not be read"));
  }
  if (bodyRead.tooLarge) {
    logPlaygroundEvent("request_body_too_large");
    return apiErrorResponse({
      kind: "input",
      message: `request body exceeds ${MAX_BODY_BYTES} bytes`,
      status: 413,
    });
  }
  const raw = bodyRead.raw;
  if (raw.length === 0) {
    return apiErrorResponse(inputError("request body must be a JSON object"));
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
    logPlaygroundEvent("artifact_unavailable", { component: component.slug });
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
    ...(validated.value.clock ? { clock: validated.value.clock } : {}),
    ...(validated.value.dependencies.length > 0
      ? { dependencies: validated.value.dependencies }
      : {}),
  };

  const releaseExecution = tryAcquirePlaygroundExecution();
  if (!releaseExecution) {
    logPlaygroundEvent("admission_rejected", { component: component.slug });
    return apiErrorResponse({
      kind: "runner",
      message: "sandbox is busy; try again shortly",
      status: 429,
    });
  }

  const executionStartedAt = Date.now();
  let result: Awaited<ReturnType<typeof runRunner>>;
  try {
    result = await runRunner(JSON.stringify(runnerRequest));
  } catch {
    logPlaygroundEvent("runner_unexpected_failure", {
      component: component.slug,
      durationMs: Date.now() - executionStartedAt,
    });
    return apiErrorResponse({
      kind: "runner",
      message: "sandbox execution failed; check the request and try again",
      status: 502,
    });
  } finally {
    releaseExecution();
  }

  if (result.killed) {
    logPlaygroundEvent("runner_timeout", {
      component: component.slug,
      durationMs: Date.now() - executionStartedAt,
    });
    return apiErrorResponse({
      kind: "runner",
      message: `sandbox-runner timed out after ${RUNNER_TIMEOUT_MS / 1000}s`,
      status: 504,
    });
  }

  if (result.exitCode !== 0) {
    // Runner output may contain filesystem paths or host diagnostics. Keep
    // those details out of the public response and return a stable error.
    logPlaygroundEvent(result.failure === "spawn" ? "runner_spawn_failed" : "runner_exit_failed", {
      component: component.slug,
      durationMs: Date.now() - executionStartedAt,
    });
    return apiErrorResponse({
      kind: "runner",
      message: "sandbox execution failed; check the request and try again",
      status: 502,
    });
  }
  const parsed = parseRunnerStdout(result.stdout);
  if (parsed === undefined) {
    logPlaygroundEvent("runner_output_invalid", {
      component: component.slug,
      durationMs: Date.now() - executionStartedAt,
    });
    return apiErrorResponse({
      kind: "runner",
      message: "sandbox execution returned an invalid result",
      status: 502,
    });
  }
  logPlaygroundEvent("execution_succeeded", {
    component: component.slug,
    durationMs: Date.now() - executionStartedAt,
    callCount: validated.value.calls.length,
    dependencyCount: validated.value.dependencies.length,
  });
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
  let fixtureIdentities: string[] | undefined;
  if ("fixtureIdentities" in request) {
    if (!Array.isArray(request.fixtureIdentities) || request.fixtureIdentities.length > MAX_IDENTITIES || request.fixtureIdentities.some((name) => typeof name !== "string" || name.length === 0 || name.length > 32)) {
      return { error: inputError("fixtureIdentities must contain at most 20 valid names") };
    }
    if (new Set(request.fixtureIdentities).size !== request.fixtureIdentities.length) return { error: inputError("fixtureIdentities must be unique") };
    fixtureIdentities = request.fixtureIdentities;
  }

  // Derive the full identity context generically from catalog metadata: the
  // base default identities (backwards compatibility) plus any identity names
  // referenced by the component/dependency constructors. Novel names get a
  // deterministic address so the runner can resolve them without the platform
  // knowing anything component-specific.
  const { knownNames, identities: resolvedIdentities } = resolveIdentityContext(
    component,
    identities,
    fixtureIdentities,
  );

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

  const clock = validateClock(request.clock, calls.length);
  if ("error" in clock) return clock;

  const dependencies = buildRunnerDependencies(component, knownNames);
  if ("error" in dependencies) return dependencies;

  return {
    value: {
      component,
      ...(Object.keys(resolvedIdentities).length > 0
        ? { identities: resolvedIdentities }
        : {}),
      constructorParams: constructorFn.params.map((param) => ({
        name: param.name,
        type: param.type,
      })),
      constructor: constructor.value,
      calls: checkedCalls,
      dependencies: dependencies.value,
      ...(clock.value ? { clock: clock.value } : {}),
    },
  };
}

function validateClock(
  value: unknown,
  callCount: number,
): { value?: RunnerClock } | { error: PlaygroundApiError } {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: inputError("clock must be an object") };
  }
  const clock = value as Record<string, unknown>;
  const initialLedgerTimestamp = clock.initialLedgerTimestamp;
  const initialLedgerSequence = clock.initialLedgerSequence;
  for (const [name, candidate] of [["initialLedgerTimestamp", initialLedgerTimestamp], ["initialLedgerSequence", initialLedgerSequence]] as const) {
    if (candidate !== undefined && !isBoundedUnsigned(candidate, name === "initialLedgerSequence" ? 4_294_967_295 : Number.MAX_SAFE_INTEGER)) {
      return { error: inputError(`clock.${name} must be a non-negative integer`) };
    }
  }
  const advances = clock.advances;
  if (!Array.isArray(advances)) return { error: inputError("clock.advances must be an array") };
  let total = BigInt(0);
  const checked = [];
  for (const advance of advances) {
    if (typeof advance !== "object" || advance === null || Array.isArray(advance)) return { error: inputError("each clock advance must be an object") };
    const item = advance as Record<string, unknown>;
    if (!Number.isInteger(item.beforeCall) || Number(item.beforeCall) < 0 || Number(item.beforeCall) > callCount) return { error: inputError("clock advance beforeCall is out of range") };
    if (!isBoundedUnsigned(item.seconds, MAX_CLOCK_ADVANCE_SECONDS)) return { error: inputError("clock advance must be bounded and non-negative") };
    total += BigInt(String(item.seconds));
    if (total > BigInt(MAX_CLOCK_ADVANCE_SECONDS)) return { error: inputError(`total clock advancement exceeds ${MAX_CLOCK_ADVANCE_SECONDS} seconds`) };
    checked.push({ beforeCall: Number(item.beforeCall), seconds: item.seconds as string | number });
  }
  return { value: { ...(initialLedgerTimestamp !== undefined ? { initialLedgerTimestamp: initialLedgerTimestamp as string | number } : {}), ...(initialLedgerSequence !== undefined ? { initialLedgerSequence: initialLedgerSequence as string | number } : {}), advances: checked } };
}

function isBoundedUnsigned(value: unknown, max: number): boolean {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 && value <= max;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return false;
  try { return BigInt(value) <= BigInt(max); } catch { return false; }
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
    const provided = dep.constructorArgs ?? {};
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

/**
 * Derives the identity context for a component generically from catalog
 * metadata. Returns the set of names that are valid to reference (identity
 * names + dependency aliases) and the `identities` map the runner needs to
 * resolve those names to addresses. The base default identities are retained
 * for backwards compatibility; any *novel* identity referenced by the catalog
 * (e.g. `governor`) receives a deterministic address so the sandbox runner can
 * resolve it without any component-specific code.
 */
export function resolveIdentityContext(
  component: StellarComponent,
  requestIdentities?: Record<string, string>,
  fixtureIdentities: readonly string[] = [],
): { knownNames: Set<string>; identities: Record<string, string> } {
  const discovered = discoverIdentityNames(component);
  const knownNames = new Set<string>([
    ...DEFAULT_IDENTITIES,
    ...discovered,
    ...(component.dependencies ?? []).map((d) => d.alias),
    ...fixtureIdentities,
  ]);

  const identities: Record<string, string> = {};
  if (requestIdentities) {
    for (const [name, key] of Object.entries(requestIdentities)) {
      identities[name] = key;
    }
  }
  for (const name of [...discovered, ...fixtureIdentities]) {
    if (name in identities) continue;
    if (DEFAULT_IDENTITIES.has(name)) continue;
    identities[name] = deterministicAddress(name);
  }
  for (const name of Object.keys(identities)) knownNames.add(name);

  return { knownNames, identities };
}

function deterministicAddress(name: string): string {
  const seed = createHash("sha256").update(`stellar-forge-identity:${name}`).digest();
  return Keypair.fromRawEd25519Seed(seed).publicKey();
}

// Deterministic, valid G-strkey derived from an identity name. The same name
// always yields the same address, so sandbox executions are reproducible.
export function validateIdentities(
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
    if (typeof key !== "string" || !isAddressRef(key, new Set(), true)) {
      return { error: inputError(`identity ${name} must be a G/C/M strkey`) };
    }
    result[name] = key;
  }
  return { value: result };
}

export function validateConstructor(
  value: unknown,
  params: ParameterSpec[],
  knownNames: Set<string>,
): { value: Record<string, unknown> } | { error: PlaygroundApiError } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: inputError("constructor must be an object") };
  }
  const ctor = value as Record<string, unknown>;
  for (const param of params) {
    const ast = parseParameterType(param.type);
    if (!ast) {
      return {
        error: inputError(
          `constructor parameter ${param.name} has unsupported type ${param.type}`,
        ),
      };
    }
    if (!isValidArg(ast, ctor[param.name], knownNames)) {
      return {
        error: inputError(
          `constructor.${param.name} must be ${describeParameterType(param.type)}`,
        ),
      };
    }
  }
  return { value: ctor };
}

export function validateCall(
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
    const ast = parseParameterType(spec.params[i].type);
    if (!ast) {
      return {
        error: inputError(
          `${fn} argument ${i} has unsupported type ${spec.params[i].type}`,
        ),
      };
    }
    if (!isValidArg(ast, args[i], knownNames)) {
      return {
        error: inputError(
          `${fn} argument ${i} must be ${describeParameterType(spec.params[i].type)}`,
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
  t: ParameterType,
  value: unknown,
  knownNames: Set<string>,
): boolean {
  if (typeof t === "string") {
    switch (t) {
      case "Address":
        return isAddressRef(value, knownNames, false);
      case "MuxedAddress":
        return isAddressRef(value, knownNames, true);
      case "i128":
        return isI128(value);
      case "u32":
        return isU32(value);
      case "u64":
      case "Timepoint":
      case "Duration":
        return isU64(value);
      case "i64":
        return isI64(value);
      case "bool":
        return value === true || value === "true" || value === "false";
      case "Bytes":
        return typeof value === "string" && HEX_STRING.test(value);
      case "String":
        return isBoundedString(value, MAX_STRING_LENGTH);
      case "Symbol":
        return isBoundedString(value, MAX_SYMBOL_LENGTH);
    }
  }

  switch (t.kind) {
    case "Vec":
      return (
        Array.isArray(value) &&
        value.every((el) => isValidArg(t.item, el, knownNames))
      );
    case "Map":
      return (
        Array.isArray(value) &&
        value.every(
          (p) =>
            p !== null &&
            typeof p === "object" &&
            "key" in p &&
            "value" in p &&
            isValidArg(t.key, (p as { key: unknown }).key, knownNames) &&
            isValidArg(t.value, (p as { value: unknown }).value, knownNames),
        )
      );
    case "Option":
      return value === null || isValidArg(t.item, value, knownNames);
  }

  return false;
}

function isU64(value: unknown): boolean {
  if (typeof value === "number") {
    return (
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= Number.MAX_SAFE_INTEGER
    );
  }
  if (typeof value === "string" && DECIMAL_STRING.test(value)) {
    try {
      return BigInt(value) <= U64_MAX;
    } catch {
      return false;
    }
  }
  return false;
}

function isI64(value: unknown): boolean {
  if (typeof value === "number") {
    return (
      Number.isSafeInteger(value) &&
      BigInt(value) >= I64_MIN &&
      BigInt(value) <= I64_MAX
    );
  }
  if (typeof value !== "string" || !INTEGER_STRING.test(value)) return false;
  try {
    const n = BigInt(value);
    return n >= I64_MIN && n <= I64_MAX;
  } catch {
    return false;
  }
}

function isAddressRef(
  value: unknown,
  knownNames: Set<string>,
  muxed: boolean,
): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  if (knownNames.has(value)) return true;
  if (muxed) {
    return (
      StrKey.isValidEd25519PublicKey(value) ||
      StrKey.isValidContract(value) ||
      StrKey.isValidMed25519PublicKey(value)
    );
  }
  return (
    StrKey.isValidEd25519PublicKey(value) || StrKey.isValidContract(value)
  );
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
): Promise<{
  exitCode: number;
  stdout: string;
  killed: boolean;
  failure?: "spawn" | "exit";
}> {
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
          const killed = error.killed === true;
          const exitCode = typeof error.code === "number" ? error.code : 1;
          resolve({
            exitCode,
            stdout,
            killed,
            failure: killed || typeof error.code === "number" ? "exit" : "spawn",
          });
        } else {
          resolve({ exitCode: 0, stdout, killed: false });
        }
      },
    );
    child.stdin?.end(input);
  });
}

function logPlaygroundEvent(
  event: string,
  details: Record<string, string | number> = {},
): void {
  // Keep diagnostics metadata-only. Never include request bodies, identities,
  // runner output, exception messages, executable paths, or artifact paths.
  console.error("[playground]", { event, ...details });
}

async function readRequestBody(
  request: Request,
): Promise<{ raw: string; tooLarge?: false } | { tooLarge: true }> {
  if (!request.body) return { raw: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return { tooLarge: true };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return { raw: Buffer.concat(chunks).toString("utf8") };
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
