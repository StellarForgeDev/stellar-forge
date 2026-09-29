// Catalog-driven read-only behavioral probe.
//
// This module answers exactly one narrow question for a registered deployment:
// "does a method the catalog has explicitly marked `readOnly: true` simulate
// successfully against the on-chain contract without reporting a write
// footprint?" It is intentionally generic — method selection and argument
// synthesis are derived entirely from `component.interface` metadata, never from
// the component's slug/name.
//
// Boundaries this module deliberately respects:
//   - It never signs, submits, funds, or creates anything. Simulation does not
//     persist state. There is no sign callback and no wallet dependency.
//   - A successful probe is NOT hash parity, NOT constructor correctness, and
//     NOT durable evidence. It only supports `partiallyVerified` behavior:
//     the contract responded to an explicitly read-only-marked query and the
//     simulation reported a read-only footprint.
//   - It does not touch artifact reconciliation. A behaviorally reachable
//     contract may still be `DEPLOYMENT_MISMATCH`.
//
// The module avoids `@/` path aliases so it can be imported by the Node CLI
// evidence harness (`scripts/verify-testnet-artifacts.ts`), which runs under
// `node --experimental-strip-types` and cannot resolve tsconfig paths.

import {
  buildInvocationArgs,
} from "../transactions/args.ts";
import { getDeployment } from "../transactions/deployments.ts";
import { isSupportedParameterType } from "../transactions/parameter-types.ts";
import { simulateSorobanInvocation } from "../transactions/rpc.ts";
import type {
  FunctionSpec,
  ParameterSpec,
  StellarComponent,
} from "../../data/components.ts";
import type { TransactionNetwork } from "../transactions/networks.ts";
import type { TransactionPreparationErrorCode } from "../transactions/types.ts";
import type {
  DeploymentStateObservation,
  DeploymentStateVerification,
} from "./deployment-evidence.ts";

/**
 * A deterministic, valid Stellar account address used as the simulation source.
 * Simulation never requires the source account to be funded, so a fixed public
 * placeholder is sufficient and keeps the probe reproducible.
 */
export const READ_ONLY_SMOKE_SOURCE_ACCOUNT =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export type ReadOnlySimulator = typeof simulateSorobanInvocation;

export interface ReadOnlySmokeOptions {
  component: StellarComponent;
  network: TransactionNetwork;
  /** Overrides the registry lookup; when omitted the registry is consulted. */
  contractId?: string | null;
  /** Injectable clock for deterministic tests. */
  now?: string;
  /** Injectable simulator for deterministic tests (defaults to real RPC). */
  simulate?: ReadOnlySimulator;
  sourceAccount?: string;
}

export interface ReadOnlySmokeResult {
  verification: DeploymentStateVerification;
  observations: DeploymentStateObservation[];
  selectedMethod: string | null;
}

/**
 * Selects the read-only method to probe, using only catalog metadata.
 *
 * Safety is anchored on the single explicit, trusted catalog field
 * `readOnly === true`. Nothing else is treated as evidence of read-only
 * behavior: `authorization === "none"`, a declared return type, arity, method
 * name, and ordering are all explicitly NOT trusted. This catalog contains
 * mutating methods that declare `authorization: "none"` and/or a return type
 * (`oracle.publish`, `timelock.release`, `multi-signature.execute`,
 * `claimable-balance.claim`), so those signals are insufficient. An absent
 * `readOnly` is treated as `false`.
 *
 * Beyond `readOnly === true`, the method must not be the constructor, must
 * declare no authorization, and must use only supported parameter types. These
 * are defense-in-depth filters only. A zero-parameter method is *preferred*
 * (fewer synthesized arguments, less ambiguity) but that is a preference, never
 * a safety rule. Returns null when the component exposes no explicitly-marked
 * read-only method (e.g. Payment, which is stateless and only exposes `pay`).
 */
export function selectReadOnlyMethod(
  component: StellarComponent,
): FunctionSpec | null {
  const candidates = (component.interface ?? []).filter(
    (fn) =>
      fn.name !== "__constructor" &&
      fn.readOnly === true &&
      fn.authorization === "none" &&
      fn.params.every((param) => isSupportedParameterType(param.type)),
  );

  if (candidates.length === 0) return null;

  return candidates.find((fn) => fn.params.length === 0) ?? candidates[0];
}

/** Synthesizes deterministic placeholder argument values for a read-only call. */
export function defaultReadOnlyArguments(
  params: readonly ParameterSpec[],
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const param of params) {
    values[param.name] = defaultReadOnlyValue(param.type);
  }
  return values;
}

function defaultReadOnlyValue(type: string): string {
  const t = type.trim();
  if (t === "Address" || t === "MuxedAddress") {
    return READ_ONLY_SMOKE_SOURCE_ACCOUNT;
  }
  if (t === "bool") return "false";
  if (t === "String") return "SMOKE";
  if (t === "Symbol") return "SMOKE";
  if (t === "Bytes") return "";
  if (t.startsWith("Vec<") || t.startsWith("Map<")) return "[]";
  if (t.startsWith("Option<")) return "null";
  return "0";
}

/**
 * Transport/setup failures mean "we could not run the probe", which is a
 * different claim from "the contract rejected the call". They must never be
 * reported as a behavioral or artifact mismatch.
 */
export function isTransportLevelFailure(
  code: TransactionPreparationErrorCode,
): boolean {
  return (
    code === "rpc-unavailable" ||
    code === "network.unsupported" ||
    code === "contract-not-deployed" ||
    code === "source-account-invalid" ||
    code === "source-account-not-found" ||
    code === "contract-address-invalid" ||
    code.startsWith("parameter-")
  );
}

export async function runReadOnlySmoke(
  options: ReadOnlySmokeOptions,
): Promise<ReadOnlySmokeResult> {
  const now = options.now ?? new Date().toISOString();
  const sourceAccount = options.sourceAccount ?? READ_ONLY_SMOKE_SOURCE_ACCOUNT;
  const method = selectReadOnlyMethod(options.component);
  const contractId =
    options.contractId ?? getDeployment(options.network, options.component.slug);

  if (!method || !contractId) {
    return {
      verification: "notQueryable",
      observations: [],
      selectedMethod: method?.name ?? null,
    };
  }

  const values = defaultReadOnlyArguments(method.params);
  const built = buildInvocationArgs(method.params, values);
  if (!built.ok) {
    return {
      verification: "notQueryable",
      selectedMethod: method.name,
      observations: [
        unavailableObservation(method, values, now, built.error.code, built.error.message),
      ],
    };
  }

  const simulate = options.simulate ?? simulateSorobanInvocation;
  const result = await simulate({
    network: options.network,
    contractAddress: contractId,
    method: method.name,
    args: built.scVals,
    sourceAccount,
  });

  if (result.ok) {
    // Runtime read-only boundary. A "readOnly: true" catalog marker is a claim;
    // the simulation's own footprint is the evidence. A call that produced
    // write entries (auth requirements or read-write footprint) must never be
    // recorded as read-only behavioral success.
    if (result.simulation.isReadCall !== true) {
      const boundary: DeploymentStateObservation = {
        method: method.name,
        args: Object.values(values),
        result: result.simulation.result,
        verifiedAt: now,
        status: "rejected",
        detail:
          "Simulation succeeded but did not satisfy the read-only boundary (isReadCall !== true); refusing to record behavioral success.",
      };
      return {
        verification: "notVerified",
        observations: [boundary],
        selectedMethod: method.name,
      };
    }

    const observation: DeploymentStateObservation = {
      method: method.name,
      args: Object.values(values),
      result: result.simulation.result,
      verifiedAt: now,
      status: "observed",
    };
    return {
      verification: "partiallyVerified",
      observations: [observation],
      selectedMethod: method.name,
    };
  }

  if (isTransportLevelFailure(result.error.code)) {
    return {
      verification: "notQueryable",
      selectedMethod: method.name,
      observations: [
        unavailableObservation(
          method,
          values,
          now,
          result.error.code,
          result.error.message,
        ),
      ],
    };
  }

  const rejected: DeploymentStateObservation = {
    method: method.name,
    args: Object.values(values),
    result: null,
    verifiedAt: now,
    status: "rejected",
    errorCode: result.error.code,
    detail: result.error.message,
  };
  return {
    verification: "notVerified",
    observations: [rejected],
    selectedMethod: method.name,
  };
}

function unavailableObservation(
  method: FunctionSpec,
  values: Record<string, string>,
  verifiedAt: string,
  errorCode: TransactionPreparationErrorCode,
  detail: string,
): DeploymentStateObservation {
  return {
    method: method.name,
    args: Object.values(values),
    result: null,
    verifiedAt,
    status: "unavailable",
    errorCode,
    detail,
  };
}
