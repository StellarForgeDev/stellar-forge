import {
  Account,
  BASE_FEE,
  Operation,
  StrKey,
  TransactionBuilder,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import type { Transaction } from "@stellar/stellar-sdk";
import {
  Api,
  Server,
  assembleTransaction,
} from "@stellar/stellar-sdk/rpc";
import {
  networkConfig,
  type NetworkConfig,
  type TransactionNetwork,
} from "@/lib/transactions/networks";
import type {
  SimulationInfo,
  TransactionPreparationError,
} from "@/lib/transactions/types";

const RPC_TIMEOUT_MS = 10_000;
const TX_TIMEOUT_SECONDS = 30;
const MAX_DETAIL_LENGTH = 300;

export interface SimulateInvocationInput {
  network: TransactionNetwork;
  contractAddress: string;
  method: string;
  args: xdr.ScVal[];
  sourceAccount: string;
}

export type SimulateInvocationResult =
  | { ok: true; simulation: SimulationInfo }
  | { ok: false; error: TransactionPreparationError };

export async function simulateSorobanInvocation(
  input: SimulateInvocationInput,
): Promise<SimulateInvocationResult> {
  const network = networkConfig(input.network);

  const contractError = validateContractAddress(input.contractAddress);
  if (contractError) return { ok: false, error: contractError };

  const sourceError = validateSourceAccount(input.sourceAccount);
  if (sourceError) return { ok: false, error: sourceError };

  const server = createServer(network);
  if (!server) {
    return { ok: false, error: rpcUnavailable(network) };
  }

  let account: Account;
  let sourceAccountFunded = true;
  try {
    account = await server.getAccount(input.sourceAccount);
  } catch {
    account = new Account(input.sourceAccount, "0");
    sourceAccountFunded = false;
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: network.passphrase,
  })
    .setTimeout(TX_TIMEOUT_SECONDS)
    .addOperation(
      Operation.invokeContractFunction({
        contract: input.contractAddress,
        function: input.method,
        args: input.args,
      }),
    )
    .build();

  let simulation: Api.SimulateTransactionResponse;
  try {
    simulation = await server.simulateTransaction(tx);
  } catch (error) {
    return { ok: false, error: rpcUnavailable(network, error) };
  }

  if (Api.isSimulationRestore(simulation)) {
    return {
      ok: false,
      error: {
        code: "simulation-failed",
        message:
          "Simulation requires restoring expired contract state, which is not supported yet.",
      },
    };
  }

  if (Api.isSimulationError(simulation)) {
    return {
      ok: false,
      error: {
        code: "simulation-failed",
        message:
          "The simulation failed. This usually means the contract rejected the call — for example, the caller lacks authorization, or one of the arguments is invalid for the current contract state.",
        ...(simulation.error
          ? { detail: truncate(simulation.error) }
          : {}),
      },
    };
  }

  let assembledXdr = "";
  try {
    assembledXdr = assembleTransaction(tx, simulation).build().toXDR();
  } catch {
    assembledXdr = "";
  }

  const resources = simulation.transactionData.build().resources();
  const retval = simulation.result?.retval ?? null;
  const nativeResult = retval ? scValToNative(retval) : undefined;
  const footprint = resources.footprint();
  const isReadCall =
    (simulation.result?.auth.length ?? 0) === 0 &&
    footprint.readWrite().length === 0;

  return {
    ok: true,
    simulation: {
      success: true,
      latestLedger: simulation.latestLedger,
      minResourceFee: simulation.minResourceFee ?? "0",
      cost: {
        cpuInstructions: String(resources.instructions()),
        memoryBytes: String(
          resources.diskReadBytes() + resources.writeBytes(),
        ),
      },
      result: retval
        ? { type: retval.switch().name, value: nativeToDisplay(nativeResult) }
        : null,
      isReadCall,
      sourceAccountFunded,
      transactionData: assembledXdr,
      expiresAt: envelopeExpiryMs(tx),
    },
  };
}

function validateContractAddress(
  address: string,
): TransactionPreparationError | null {
  if (!StrKey.isValidContract(address)) {
    return {
      code: "contract-address-invalid",
      message: `"${address}" is not a valid Soroban contract address (C...).`,
    };
  }
  return null;
}

function validateSourceAccount(
  address: string,
): TransactionPreparationError | null {
  if (!StrKey.isValidEd25519PublicKey(address)) {
    return {
      code: "source-account-invalid",
      message: "Source account must be a valid Stellar account address (G...).",
    };
  }
  return null;
}

function createServer(network: NetworkConfig): Server | null {
  try {
    return new Server(effectiveRpcUrl(network), { timeout: RPC_TIMEOUT_MS });
  } catch {
    return null;
  }
}

export { createServer };

function effectiveRpcUrl(network: NetworkConfig): string {
  if (network.id === "testnet") {
    return process.env.STELLAR_RPC_TESTNET_URL ?? network.rpcUrl;
  }
  if (network.id === "mainnet") {
    return process.env.STELLAR_RPC_MAINNET_URL ?? network.rpcUrl;
  }
  return process.env.STELLAR_RPC_FUTURENET_URL ?? network.rpcUrl;
}

function rpcUnavailable(
  network: NetworkConfig,
  error?: unknown,
): TransactionPreparationError {
  const detail = error instanceof Error ? error.message : undefined;
  return {
    code: "rpc-unavailable",
    message: `Could not reach the ${network.label} RPC server.`,
    ...(detail ? { detail: truncate(detail) } : {}),
  };
}

function truncate(value: string): string {
  return value.length > MAX_DETAIL_LENGTH
    ? `${value.slice(0, MAX_DETAIL_LENGTH)}...`
    : value;
}

function envelopeExpiryMs(tx: Transaction): number {
  const bounds = tx.timeBounds;
  if (!bounds) return 0;
  const maxTime = Number(bounds.maxTime);
  return maxTime > 0 ? maxTime * 1000 : 0;
}

function nativeToDisplay(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export { nativeToDisplay };