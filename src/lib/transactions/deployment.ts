import { Account, BASE_FEE, Operation, TransactionBuilder, nativeToScVal, Address, type Transaction, type xdr } from "@stellar/stellar-sdk";
import { Api, assembleTransaction, Server, type Server as ServerType } from "@stellar/stellar-sdk/rpc";
import { networkConfig } from "./networks";

export type DeploymentStage = "upload" | "create";
export interface PreparedDeploymentStage { stage: DeploymentStage; transactionXdr: string; simulation: { status: "SUCCESS" | "FAILED"; latestLedger: number; result: string | null; error?: string }; }
export type DeploymentPreparationFailureCategory = "ACCOUNT_LOOKUP_FAILED" | "SIMULATION_FAILED" | "ASSEMBLY_FAILED" | "ASSEMBLY_VALIDATION_FAILED";
export interface FailedDeploymentPreparation { status: "FAILED"; error: string; errorCategory: DeploymentPreparationFailureCategory; diagnostic?: string; }

function safeDiagnostic(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const message = error.message.trim();
  return message ? message.slice(0, 300) : undefined;
}

function isUploadContractWasmOperation(operation: unknown): boolean {
  const value = operation as { type?: string; func?: { _switch?: { name?: string }; _arm?: string } };
  if (value.type !== "invokeHostFunction" || !value.func) return false;
  return value.func._switch?.name === "hostFunctionTypeUploadContractWasm" || value.func._arm === "wasm";
}

/**
 * Applies the SDK simulation response and verifies the resulting upload
 * transaction before it can be returned for wallet signing.
 */
export function assembleAndValidateUploadTransaction(
  tx: Transaction,
  simulation: Api.SimulateTransactionResponse,
  expectedSource: string,
): { ok: true; transaction: Transaction; transactionXdr: string } | { ok: false; error: string; errorCategory: "ASSEMBLY_FAILED" | "ASSEMBLY_VALIDATION_FAILED"; diagnostic?: string } {
  let assembled: Transaction;
  try {
    assembled = assembleTransaction(tx, simulation).build();
  } catch (error) {
    return { ok: false, error: "Soroban transaction assembly failed after simulation.", errorCategory: "ASSEMBLY_FAILED", diagnostic: safeDiagnostic(error) };
  }

  const operations = assembled.operations as unknown[];
  if (operations.length !== 1 || !isUploadContractWasmOperation(operations[0])) {
    return { ok: false, error: "Assembled transaction is not exactly one uploadContractWasm operation.", errorCategory: "ASSEMBLY_VALIDATION_FAILED" };
  }
  if (assembled.source !== expectedSource) {
    return { ok: false, error: "Assembled transaction source account changed unexpectedly.", errorCategory: "ASSEMBLY_VALIDATION_FAILED" };
  }

  const sorobanData = assembled.toEnvelope().v1().tx().ext().value();
  if (!sorobanData) {
    return { ok: false, error: "Assembled transaction is missing Soroban transaction data.", errorCategory: "ASSEMBLY_VALIDATION_FAILED" };
  }
  const resources = sorobanData.resources();
  const footprint = resources.footprint();
  if (footprint.readOnly().length + footprint.readWrite().length === 0) {
    return { ok: false, error: "Assembled transaction is missing a Soroban footprint.", errorCategory: "ASSEMBLY_VALIDATION_FAILED" };
  }
  if (sorobanData.resourceFee().toBigInt() <= BigInt(0)) {
    return { ok: false, error: "Assembled transaction is missing a valid Soroban resource fee.", errorCategory: "ASSEMBLY_VALIDATION_FAILED" };
  }

  return { ok: true, transaction: assembled, transactionXdr: assembled.toXDR() };
}

/**
 * Controlled deployment uses a bounded 5-minute window to cover:
 * prepare → simulation → UI confirmation → Freighter signing → submit,
 * while remaining finite (verified by verifyTimeBounds, max 24h).
 * Normal /transactions keep TX_TIMEOUT_SECONDS=30.
 */
export const CONTROLLED_DEPLOYMENT_TIMEOUT_SECONDS = 300;

/** Read-only preparation/simulation for one deployment stage. It never signs or submits. */
export async function prepareDeploymentStage(input: { stage: DeploymentStage; network: "testnet"; sourceAccount: string; wasm?: Uint8Array; wasmHash: string; constructorArgs?: xdr.ScVal[] }): Promise<PreparedDeploymentStage | FailedDeploymentPreparation> {
  if (input.network !== "testnet") return { status: "FAILED", error: "Controlled deployment preparation is restricted to Testnet.", errorCategory: "SIMULATION_FAILED" };
  const server = new Server(networkConfig(input.network).rpcUrl, { timeout: 10_000 });
  let account: Account;
  try {
    const accountResponse = await server.getAccount(input.sourceAccount);
    const sequence = accountResponse.sequenceNumber();
    if (!/^\d+$/.test(sequence)) throw new Error("The Testnet account returned an invalid sequence number.");
    account = new Account(input.sourceAccount, sequence);
  } catch (error) {
    return {
      status: "FAILED",
      error: "Could not retrieve the current deployment account sequence from canonical Testnet.",
      errorCategory: "ACCOUNT_LOOKUP_FAILED",
      diagnostic: safeDiagnostic(error),
    };
  }
  const operation = input.stage === "upload"
    ? Operation.uploadContractWasm({ wasm: Buffer.from(input.wasm ?? []), source: input.sourceAccount })
    : Operation.createCustomContract({ address: new Address(input.sourceAccount), wasmHash: Buffer.from(input.wasmHash, "hex"), constructorArgs: input.constructorArgs ?? [], source: input.sourceAccount });
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: networkConfig("testnet").passphrase }).setTimeout(CONTROLLED_DEPLOYMENT_TIMEOUT_SECONDS).addOperation(operation).build();
  let simulation: Api.SimulateTransactionResponse;
  try { simulation = await server.simulateTransaction(tx); } catch (error) { return { status: "FAILED", error: error instanceof Error ? error.message : "Testnet simulation failed.", errorCategory: "SIMULATION_FAILED", diagnostic: safeDiagnostic(error) }; }
  if (Api.isSimulationError(simulation) || Api.isSimulationRestore(simulation)) return { status: "FAILED", error: Api.isSimulationError(simulation) ? simulation.error : "Simulation requires state restoration.", errorCategory: "SIMULATION_FAILED" };
  if (input.stage === "upload") {
    const assembled = assembleAndValidateUploadTransaction(tx, simulation, input.sourceAccount);
    if (!assembled.ok) return { status: "FAILED", error: assembled.error, errorCategory: assembled.errorCategory, diagnostic: assembled.diagnostic };
    return { stage: input.stage, transactionXdr: assembled.transactionXdr, simulation: { status: "SUCCESS", latestLedger: simulation.latestLedger, result: simulation.result?.retval ? String(simulation.result.retval) : null } };
  }
  let transactionXdr: string;
  try { transactionXdr = assembleTransaction(tx, simulation).build().toXDR(); } catch (error) { return { status: "FAILED", error: "Soroban transaction assembly failed after simulation.", errorCategory: "ASSEMBLY_FAILED", diagnostic: safeDiagnostic(error) }; }
  return { stage: input.stage, transactionXdr, simulation: { status: "SUCCESS", latestLedger: simulation.latestLedger, result: simulation.result?.retval ? String(simulation.result.retval) : null } };
}

export async function confirmedTransactionExists(server: ServerType, hash: string): Promise<boolean> {
  try { const result = await server.getTransaction(hash); return result.status === Api.GetTransactionStatus.SUCCESS; } catch { return false; }
}

/** Canonical read-only Testnet RPC for controlled deployment confirmation and verification. */
export function controlledTestnetRpcUrl(): string { return networkConfig("testnet").rpcUrl; }

export function canonicalTestnetServer(): ServerType { return new Server(controlledTestnetRpcUrl(), { timeout: 10_000 }); }

export function constructorValuesToScVals(params: { name: string; type: string }[], values: Record<string, string>): xdr.ScVal[] | null {
  return params.map((param) => { try { return nativeToScVal(values[param.name] ?? "", { type: param.type as never }); } catch { return null; } }).every((value): value is xdr.ScVal => value !== null) ? params.map((param) => nativeToScVal(values[param.name] ?? "", { type: param.type as never })) : null;
}
