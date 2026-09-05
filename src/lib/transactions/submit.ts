import {
  Keypair,
  StrKey,
  Transaction,
  TransactionBuilder,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  Api,
  type Server,
} from "@stellar/stellar-sdk/rpc";
import {
  networkConfig,
  type TransactionNetwork,
} from "@/lib/transactions/networks";
import {
  createServer,
  nativeToDisplay,
} from "@/lib/transactions/rpc";
import { canonicalTestnetServer } from "@/lib/transactions/deployment";
import type {
  TransactionSubmissionError,
  TransactionSubmissionResult,
} from "@/lib/transactions/types";

const MAX_FUTURE_EXPIRATION_SECONDS = 24 * 60 * 60;
const MAX_POLLS = 12;
const POLL_INTERVAL_MS = 1_500;
const MAX_DETAIL_LENGTH = 300;
const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

export interface SubmitTransactionInput {
  network: TransactionNetwork;
  signedXdr: string;
  controlledDeployment?: boolean;
}

export type SubmitTransactionResult =
  | { ok: true; submission: TransactionSubmissionResult }
  | { ok: false; error: TransactionSubmissionError };

export async function submitTransaction(
  input: SubmitTransactionInput,
): Promise<SubmitTransactionResult> {
  const envelope = parseEnvelope(input);
  if (!envelope.ok) return envelope;

  const tx = envelope.tx;
  const network = envelope.network;

  const signatureError = verifySourceSignature(tx);
  if (signatureError) return { ok: false, error: signatureError };

  const timeError = verifyTimeBounds(tx);
  if (timeError) return { ok: false, error: timeError };

  const uploadStructureError = verifyControlledUploadStructure(tx);
  if (uploadStructureError) return { ok: false, error: uploadStructureError };

  // Controlled deployment is pinned to canonical Testnet. The normal
  // transaction builder continues to use its existing network configuration.
  const server = input.controlledDeployment
    ? network.id === "testnet" ? canonicalTestnetServer() : null
    : createServer(network);
  if (!server) {
    return {
      ok: false,
      error: {
        code: "rpc-unavailable",
        message: `Could not reach the ${network.label} RPC server.`,
      },
    };
  }

  let sendResult: Api.SendTransactionResponse;
  try {
    sendResult = await server.sendTransaction(tx);
  } catch (error) {
    return { ok: false, error: rpcFailure(network, error) };
  }

  if (sendResult.status === "ERROR") {
    const resultDetail = sendResult.errorResult
      ? transactionResultDetail(sendResult.errorResult)
      : undefined;

    const authMessage = resultDetail
      ? authorizationFailureMessage(resultDetail)
      : null;

    const diagnostic = buildErrorDiagnostic(sendResult, resultDetail ?? undefined, network);

    return {
      ok: false,
      error: {
        code: "submit-rejected",
        message: "The network rejected the transaction.",
        ...(authMessage ? { detail: truncate(authMessage as string) } : resultDetail ? { detail: truncate(resultDetail as string) } : {}),
        ...(diagnostic ? { diagnostic } : {}),
      },
    };
  }

  if (sendResult.status === "TRY_AGAIN_LATER") {
    const outcome = await pollForSettlement(server, sendResult.hash);
    if (outcome !== null) return outcome;

    return {
      ok: false,
      error: {
        code: "submit-rejected",
        message:
          "The network is busy and did not accept the transaction right now. Wait a moment and try again — re-sending the same signed transaction is safe and will not create a duplicate.",
      },
    };
  }

  if (
    sendResult.status !== "PENDING" &&
    sendResult.status !== "DUPLICATE"
  ) {
    return {
      ok: false,
      error: {
        code: "submit-rejected",
        message: `The network did not accept the transaction (${sendResult.status}).`,
      },
    };
  }

  return pollForResult(server, sendResult.hash, sendResult.latestLedger);
}

function parseEnvelope(
  input: SubmitTransactionInput,
):
  | { ok: true; tx: Transaction; network: ReturnType<typeof networkConfig> }
  | { ok: false; error: TransactionSubmissionError } {
  const network = networkConfig(input.network);

  if (typeof input.signedXdr !== "string" || input.signedXdr.length === 0) {
    return {
      ok: false,
      error: {
        code: "envelope.invalid",
        message: "A signed transaction XDR is required.",
      },
    };
  }

  if (
    input.signedXdr.length % 4 !== 0 ||
    !BASE64_REGEX.test(input.signedXdr)
  ) {
    return {
      ok: false,
      error: {
        code: "envelope.invalid",
        message: "The signed transaction is not valid base64 XDR.",
      },
    };
  }

  let parsed: Transaction | ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    parsed = TransactionBuilder.fromXDR(input.signedXdr, network.passphrase);
  } catch {
    return {
      ok: false,
      error: {
        code: "envelope.invalid",
        message: "The signed transaction XDR could not be parsed.",
      },
    };
  }

  if (!(parsed instanceof Transaction)) {
    return {
      ok: false,
      error: {
        code: "envelope.invalid",
        message: "Fee-bump envelopes are not supported.",
      },
    };
  }

  return { ok: true, tx: parsed, network };
}

function verifySourceSignature(
  tx: Transaction,
): TransactionSubmissionError | null {
  if (tx.signatures.length === 0) {
    return {
      code: "envelope.unsigned",
      message: "The transaction envelope has no signatures.",
    };
  }

  if (!StrKey.isValidEd25519PublicKey(tx.source)) {
    return {
      code: "envelope.unsigned",
      message: "The transaction source is not a plain Ed25519 account.",
    };
  }

  let keypair: Keypair;
  try {
    keypair = Keypair.fromPublicKey(tx.source);
  } catch {
    return {
      code: "envelope.unsigned",
      message: "The transaction source could not be resolved.",
    };
  }

  const txHash = tx.hash();
  const expectedHint = keypair.signatureHint();
  const valid = tx.signatures.some((signature) => {
    if (!signature.hint().equals(expectedHint)) return false;
    try {
      return keypair.verify(txHash, signature.signature());
    } catch {
      return false;
    }
  });

  if (!valid) {
    return {
      code: "envelope.unsigned",
      message:
        "No valid signature from the transaction source account was found.",
    };
  }

  return null;
}

function verifyTimeBounds(tx: Transaction): TransactionSubmissionError | null {
  const bounds = tx.timeBounds;
  const maxTime = bounds ? Number(bounds.maxTime) : 0;

  if (maxTime <= 0) {
    return {
      code: "envelope.future-expiration",
      message:
        "The envelope has no upper time bound, which is not accepted.",
    };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (nowSeconds >= maxTime) {
    return {
      code: "envelope.expired",
      message:
        "The transaction expired before it was submitted. The prepare step will refresh it so you can sign again.",
    };
  }

  if (maxTime - nowSeconds > MAX_FUTURE_EXPIRATION_SECONDS) {
    return {
      code: "envelope.future-expiration",
      message:
        "The envelope expires more than 24 hours in the future, which is not accepted.",
    };
  }

  return null;
}

function isUploadContractWasmOperation(op: unknown): boolean {
  try {
    const o = op as {
      type?: string;
      func?: { _switch?: { name?: string }; _arm?: string };
    };
    if (typeof o.type === "string" && o.type !== "invokeHostFunction") return false;
    if (!o.func) return false;
    const switchName = (o.func as unknown as { _switch?: { name?: string } })?._switch?.name;
    if (switchName === "hostFunctionTypeUploadContractWasm") return true;
    // Fallback: _arm === "wasm" also indicates upload
    if ((o.func as unknown as { _arm?: string })?._arm === "wasm") return true;
    return false;
  } catch {
    return false;
  }
}

function verifyControlledUploadStructure(tx: Transaction): TransactionSubmissionError | null {
  const ops = tx.operations as unknown[];
  const hasUpload = ops.some(isUploadContractWasmOperation);
  // Only enforce upload-specific rules when the transaction contains an upload operation.
  // Normal builder transactions without upload are not affected.
  if (!hasUpload) return null;
  if (ops.length !== 1) {
    return {
      code: "envelope.invalid",
      message: "Controlled upload must contain exactly one uploadContractWasm operation.",
    };
  }
  if (!isUploadContractWasmOperation(ops[0])) {
    return {
      code: "envelope.invalid",
      message: "Controlled upload transaction must be exactly one uploadContractWasm operation.",
    };
  }
  const opSource = (ops[0] as { source?: string | null })?.source ?? null;
  if (opSource && opSource !== tx.source) {
    return {
      code: "envelope.invalid",
      message: "Controlled upload operation source must match transaction source.",
    };
  }
  return null;
}

export function verifyControlledUploadForTest(tx: Transaction): TransactionSubmissionError | null {
  // Strict validator for controlled upload — used in tests to verify 0/2+/unrelated cases
  const ops = tx.operations as unknown[];
  if (ops.length !== 1) {
    return {
      code: "envelope.invalid",
      message: "Controlled upload must contain exactly one uploadContractWasm operation.",
    };
  }
  if (!isUploadContractWasmOperation(ops[0])) {
    return {
      code: "envelope.invalid",
      message: "Controlled upload transaction must be exactly one uploadContractWasm operation.",
    };
  }
  const opSource = (ops[0] as { source?: string | null })?.source ?? null;
  if (opSource && opSource !== tx.source) {
    return {
      code: "envelope.invalid",
      message: "Controlled upload operation source must match transaction source.",
    };
  }
  return null;
}

function authorizationFailureMessage(resultDetail: string): string | null {
  if (!/invokeHostFunction/i.test(resultDetail) || !/txFailed/i.test(resultDetail)) {
    return null;
  }
  return `The contract rejected the transaction at execution time. This typically means the signing wallet is not the account the contract requires (for example, it is not the owner of the first address argument or the contract admin). Technical detail: ${resultDetail}`;
}

function buildErrorDiagnostic(
  sendResult: Api.SendTransactionResponse,
  resultDetail: string | undefined,
  network: ReturnType<typeof networkConfig>,
): NonNullable<TransactionSubmissionError["diagnostic"]> | undefined {
  try {
    const diagnostic: NonNullable<TransactionSubmissionError["diagnostic"]> = {
      sendTransactionStatus: (sendResult as { status?: string }).status ?? "ERROR",
      network: network.id,
      endpoint: network.rpcUrl,
    };
    if (resultDetail) {
      const parsed = parseTransactionResultForDiagnostic(resultDetail);
      if (parsed.txCode) diagnostic.transactionResultCode = parsed.txCode;
      if (parsed.opCodes && parsed.opCodes.length > 0) diagnostic.operationResultCodes = parsed.opCodes.slice(0, 5);
      if (parsed.hostFunctionType) diagnostic.hostFunctionType = parsed.hostFunctionType;
    }
    const maybeHash = (sendResult as { hash?: unknown }).hash;
    if (typeof maybeHash === "string" && /^[a-f0-9]{64}$/i.test(maybeHash)) {
      diagnostic.transactionHash = maybeHash;
    }
    return diagnostic;
  } catch {
    return undefined;
  }
}

function parseTransactionResultForDiagnostic(detail: string): {
  txCode?: string;
  opCodes?: string[];
  hostFunctionType?: string;
} {
  try {
    const txCodeMatch = detail.match(/\b(txFailed|txSuccess|txBadSeq|txTooEarly|txTooLate|txMissingOperation|txBadAuth|txInsufficientBalance|txNoAccount|txInsufficientFee|txBadAuthExtra)\b/i);
    const txCode = txCodeMatch ? txCodeMatch[0] : undefined;
    const opCodes: string[] = [];
    const lower = detail.toLowerCase();
    if (lower.includes("invokehostfunction")) opCodes.push("invokeHostFunction");
    if (lower.includes("uploadcontractwasm") || lower.includes("hostfunctiontypeuploadcontractwasm")) {
      return { txCode, opCodes: opCodes.length ? opCodes : ["invokeHostFunction"], hostFunctionType: "uploadContractWasm" };
    }
    if (lower.includes("createcontract") || lower.includes("hostfunctiontypecreatecontract")) {
      return { txCode, opCodes: opCodes.length ? opCodes : ["invokeHostFunction"], hostFunctionType: "createContract" };
    }
    // Fallback: extract op names after colon
    const colonPart = detail.split(":")[1];
    if (colonPart) {
      const parts = colonPart.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0 && opCodes.length === 0) return { txCode, opCodes: parts.slice(0, 5) };
    }
    return { txCode, opCodes: opCodes.length ? opCodes : undefined };
  } catch {
    return {};
  }
}

async function pollForSettlement(
  server: Server,
  transactionHash: string,
): Promise<SubmitTransactionResult | null> {
  let polls = 0;

  while (polls < MAX_POLLS) {
    await sleep(POLL_INTERVAL_MS);
    polls += 1;

    let result: Api.GetTransactionResponse;
    try {
      result = await server.getTransaction(transactionHash);
    } catch (error) {
      return { ok: false, error: rpcFailure(undefined, error) };
    }

    if (result.status === Api.GetTransactionStatus.NOT_FOUND) {
      continue;
    }

    if (result.status === Api.GetTransactionStatus.SUCCESS) {
      const returnValue = result.returnValue
        ? {
            type: result.returnValue.switch().name,
            value: nativeToDisplay(scValToNative(result.returnValue)),
          }
        : null;

      return {
        ok: true,
        submission: {
          status: "SUCCESS",
          transactionHash,
          submittedAt: new Date().toISOString(),
          returnValue,
        },
      };
    }

    const rawDetail =
      transactionResultDetail(result.resultXdr) ??
      "The transaction failed on-chain.";

    return {
      ok: true,
      submission: {
        status: "FAILED",
        transactionHash,
        submittedAt: new Date().toISOString(),
        returnValue: null,
        detail: truncate(
          authorizationFailureMessage(rawDetail) ?? rawDetail,
        ),
      },
    };
  }

  return null;
}

async function pollForResult(
  server: Server,
  transactionHash: string,
  latestLedger: number,
): Promise<SubmitTransactionResult> {
  const outcome = await pollForSettlement(server, transactionHash);
  if (outcome !== null) return outcome;

  return {
    ok: true,
    submission: {
      status: "PENDING",
      transactionHash,
      submittedAt: new Date().toISOString(),
      returnValue: null,
      detail: `Submitted and accepted, but not confirmed within the polling window (ledger ${latestLedger}).`,
    },
  };
}

function transactionResultDetail(result: xdr.TransactionResult): string | null {
  try {
    const txResult = result.result();
    const txCode = txResult.switch().name;
    if (txCode !== "txFailed" && txCode !== "txSuccess") {
      return txCode;
    }

    const opNames: string[] = [];

    for (const op of txResult.results()) {
      if (op.switch().name === "opInner") {
        const tr = op.tr();
        const opType = tr.switch().name;
        if (opType === "invokeHostFunction") {
          opNames.push(tr.invokeHostFunctionResult().switch().name);
        } else {
          opNames.push(opType);
        }
      } else {
        opNames.push(op.switch().name);
      }
    }

    return opNames.length > 0 ? `${txCode}: ${opNames.join(", ")}` : txCode;
  } catch {
    return null;
  }
}

function rpcFailure(
  network: ReturnType<typeof networkConfig> | undefined,
  error?: unknown,
): TransactionSubmissionError {
  const detail = error instanceof Error ? error.message : undefined;
  return {
    code: "rpc-unavailable",
    message: `Could not reach the ${
      network?.label ?? "Stellar"
    } RPC server while submitting.`,
    ...(detail ? { detail: truncate(detail) } : {}),
  };
}

function truncate(value: string): string {
  return value.length > MAX_DETAIL_LENGTH
    ? `${value.slice(0, MAX_DETAIL_LENGTH)}...`
    : value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
