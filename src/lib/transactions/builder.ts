import type {
  FunctionAuthorization,
  FunctionSpec,
  ParameterSpec,
  StellarComponent,
} from "@/data/components";
import { getDeployment } from "@/lib/transactions/deployments";
import {
  networkConfig,
  networkLabel,
  type TransactionNetwork,
} from "@/lib/transactions/networks";
import type {
  TransactionBuilderState,
  TransactionPreparation,
  TransactionPreparationPhase,
  TransactionPreviewData,
  TransactionRequest,
  TransactionSigningState,
  TransactionSubmissionState,
  TransactionValidation,
} from "@/lib/transactions/types";
import type { WalletState } from "@/lib/wallet/types";
import { orderComponents } from "@/data/components";
import { validateTransactionRequest } from "@/lib/transactions/validate";

export function callableMethods(
  component: StellarComponent,
): FunctionSpec[] {
  return (component.interface ?? []).filter(
    (fn) => fn.name !== "__constructor",
  );
}

function isComponentAvailableForNetwork(
  component: StellarComponent,
  network: TransactionNetwork,
): boolean {
  if (network === "mainnet") return !!component.capabilities.mainnet;
  if (network === "futurenet") return false;
  return component.capabilities.testnet;
}

export function transactionComponents(
  components: StellarComponent[],
  network: TransactionNetwork = "testnet",
): StellarComponent[] {
  return orderComponents(
    components.filter(
      (component) =>
        isComponentAvailableForNetwork(component, network) &&
        callableMethods(component).length > 0,
    ),
  );
}

export function isComponentAvailable(
  component: StellarComponent,
  network: TransactionNetwork,
): boolean {
  return (
    isComponentAvailableForNetwork(component, network) &&
    callableMethods(component).length > 0
  );
}

export function emptyParameters(
  params: FunctionSpec["params"],
): Record<string, string> {
  return Object.fromEntries(params.map((param) => [param.name, ""]));
}

export function parameterPlaceholder(param: ParameterSpec): string {
  if (param.placeholder !== undefined) return param.placeholder;
  switch (param.type) {
    case "Address":
    case "MuxedAddress":
      return "G...";
    case "i128":
      return "1000000";
    case "u32":
      return "200";
    case "String":
      return "text";
    case "Symbol":
      return "symbol";
    default:
      return "";
  }
}

export function authorizationInfo(
  method: FunctionSpec | undefined,
): {
  kind: FunctionAuthorization;
  description: string;
  paramName?: string;
} {
  const kind = method?.authorization ?? "none";

  switch (kind) {
    case "admin":
      return {
        kind,
        description:
          "Requires the contract administrator's wallet. The admin is set when the contract is deployed and is not exposed by this tool — if the connected wallet is not the admin, the transaction will be rejected on-chain.",
      };
    case "first-address": {
      const first = method?.params.find(
        (param) => param.type === "Address" || param.type === "MuxedAddress",
      );
      return {
        kind,
        paramName: first?.name,
        description: `Requires authorization from the first address argument${
          first?.name ? ` (${first.name})` : ""
        }. The wallet that signs must own that address, otherwise the transaction will be rejected on-chain.`,
      };
    }
    default:
      return {
        kind,
        description:
          "No special authorization required. Any wallet can invoke this method.",
      };
  }
}

export function initialBuilderState(
  components: StellarComponent[],
): TransactionBuilderState {
  const component = transactionComponents(components)[0];

  if (!component) {
    return {
      componentSlug: "",
      methodName: "",
      network: "testnet",
      sourceAccount: "",
      parameters: {},
    };
  }

  const method = callableMethods(component)[0];

  return {
    componentSlug: component.slug,
    methodName: method?.name ?? "",
    network: "testnet",
    sourceAccount: "",
    parameters: method ? emptyParameters(method.params) : {},
  };
}

export function buildTransactionRequest(
  state: TransactionBuilderState,
): TransactionRequest {
  return {
    network: state.network,
    component: state.componentSlug,
    method: state.methodName,
    sourceAccount: state.sourceAccount,
    parameters: { ...state.parameters },
  };
}

export function validateBuilderState(
  state: TransactionBuilderState,
  components: StellarComponent[],
): TransactionValidation {
  const validation = validateTransactionRequest(
    buildTransactionRequest(state),
    components,
  );

  return {
    errors: Object.fromEntries(
      validation.errors.map((error) => [error.field, error.message]),
    ),
    canBuild: validation.ok,
  };
}

function previewStatusLabel(
  phase: TransactionPreparationPhase,
  validationOk: boolean,
): string {
  switch (phase) {
    case "draft":
      return validationOk ? "Ready to build" : "Waiting for required parameters";
    case "built":
      return "Ready for simulation";
    case "preparing":
      return "Simulating...";
    case "prepared":
      return "Simulation successful";
    case "signed":
      return "Signed by wallet";
    case "failed":
      return "Simulation failed";
    case "blocked":
      return "Contract deployment required";
  }
}

export function buildPreview(
  state: TransactionBuilderState,
  components: StellarComponent[],
  preparation: TransactionPreparation,
  wallet: WalletState,
  signing: TransactionSigningState,
  submission: TransactionSubmissionState,
): TransactionPreviewData {
  const component = components.find(
    (candidate) => candidate.slug === state.componentSlug,
  );
  const method = component
    ? callableMethods(component).find((fn) => fn.name === state.methodName)
    : undefined;
  const request = buildTransactionRequest(state);
  const validation = validateTransactionRequest(request, components);
  const deployment = getDeployment(state.network, state.componentSlug);

  const requestToShow =
    preparation.phase === "draft"
      ? null
      : preparation.phase === "built" || preparation.phase === "preparing"
        ? preparation.request
        : preparation.phase === "signed"
          ? preparation.request
          : preparation.result.request;

  const preparationError =
    preparation.phase === "failed"
      ? preparation.result.preparationError
      : preparation.phase === "blocked"
        ? preparation.result.error
        : undefined;

  const walletNetworkMismatch =
    wallet.status === "connected" &&
    wallet.networkPassphrase !== networkConfig(state.network).passphrase;

  const preparedSimulation =
    preparation.phase === "prepared" ? preparation.result.simulation : undefined;

  return {
    networkLabel: networkLabel(state.network),
    sourceAccount: state.sourceAccount || "Not connected",
    componentName: component?.name ?? "—",
    methodName: method?.name ?? "—",
    arguments: (method?.params ?? []).map((param) => ({
      name: param.name,
      type: param.type,
      value: state.parameters[param.name] ?? "",
    })),
    phase: preparation.phase,
    statusLabel: previewStatusLabel(preparation.phase, validation.ok),
    errors: validation.errors,
    request: requestToShow,
    deploymentStatus: deployment ? "configured" : "missing",
    contractAddress: deployment ?? undefined,
    preparationError,
    simulation: preparedSimulation,
    sourceAccountFunded: preparedSimulation?.sourceAccountFunded,
    authorization: authorizationInfo(method),
    preparedAt:
      preparation.phase === "prepared"
        ? preparation.result.metadata.preparedAt
        : undefined,
    expiresAt: preparedSimulation?.expiresAt,
    expired: Boolean(
      preparedSimulation &&
        preparedSimulation.expiresAt > 0 &&
        Date.now() >= preparedSimulation.expiresAt,
    ),
    walletStatus: wallet.status,
    walletAddress: wallet.address ?? undefined,
    walletNetworkName: wallet.networkName ?? undefined,
    walletNetworkPassphrase: wallet.networkPassphrase ?? undefined,
    walletError: wallet.error ?? undefined,
    walletNetworkMismatch,
    signingPhase: signing.phase,
    signingError: signing.error,
    signedXdr: signing.signedXdr,
    signerAddress: signing.signerAddress,
    signedAt: signing.signedAt,
    submissionPhase: submission.phase,
    submissionStatus: submission.status,
    submissionError: submission.error,
    submissionTransactionHash: submission.transactionHash,
    submissionReturnValue: submission.returnValue,
    submissionDetail: submission.detail,
    submittedAt: submission.submittedAt,
  };
}