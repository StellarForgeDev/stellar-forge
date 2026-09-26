import { createHash } from "node:crypto";
import { StrKey, TransactionBuilder } from "@stellar/stellar-sdk";
import { networkConfig } from "@/lib/transactions/networks";

export type ControlledDeploymentStage = "upload" | "create";

export type ControlledDeploymentTransactionCheck =
  | { ok: true; stage: ControlledDeploymentStage; sourceAccount: string; artifactHash: string }
  | { ok: false; error: string };

/**
 * Validates the exact operation and artifact bound into a signed controlled
 * deployment transaction. This is deliberately server-side and accepts no
 * client-provided candidate hash.
 */
export function validateControlledDeploymentTransaction(
  signedXdr: string,
  expectedCandidateHash: string,
): ControlledDeploymentTransactionCheck {
  try {
    const transaction = TransactionBuilder.fromXDR(signedXdr, networkConfig("testnet").passphrase);
    if (!("operations" in transaction) || transaction.operations.length !== 1) {
      return { ok: false, error: "Controlled deployment must contain exactly one operation." };
    }

    const operation = transaction.operations[0] as unknown as {
      type?: string;
      source?: string;
      func?: {
        _switch?: { name?: string };
        _arm?: string;
        wasm?: () => Buffer;
        createContractV2?: () => { executable: () => { wasmHash?: () => Buffer } };
      };
    };
    const sourceAccount = operation.source ?? ("source" in transaction && typeof transaction.source === "string" ? transaction.source : "");
    if (!sourceAccount || !StrKey.isValidEd25519PublicKey(sourceAccount)) {
      return { ok: false, error: "Controlled deployment source must be a valid public G... account." };
    }
    if (operation.type !== "invokeHostFunction" || !operation.func) {
      return { ok: false, error: "Controlled deployment operation is not a Soroban host-function operation." };
    }

    if (operation.func._switch?.name === "hostFunctionTypeUploadContractWasm" && operation.func._arm === "wasm") {
      const wasm = operation.func.wasm?.();
      if (!wasm) return { ok: false, error: "Controlled upload does not contain WASM bytes." };
      const artifactHash = createHash("sha256").update(wasm).digest("hex");
      if (artifactHash !== expectedCandidateHash) return { ok: false, error: "Signed upload WASM does not match the current deployment candidate." };
      return { ok: true, stage: "upload", sourceAccount, artifactHash };
    }

    if (operation.func._switch?.name === "hostFunctionTypeCreateContractV2" && operation.func._arm === "createContractV2") {
      const wasmHash = operation.func.createContractV2?.().executable().wasmHash?.();
      if (!wasmHash) return { ok: false, error: "Controlled create operation does not reference a WASM hash." };
      const artifactHash = Buffer.from(wasmHash).toString("hex");
      if (artifactHash !== expectedCandidateHash) return { ok: false, error: "Signed create operation does not reference the current deployment candidate." };
      return { ok: true, stage: "create", sourceAccount, artifactHash };
    }

    return { ok: false, error: "Controlled deployment operation must be an Access Control WASM upload or create operation." };
  } catch {
    return { ok: false, error: "Signed controlled deployment XDR could not be inspected." };
  }
}
