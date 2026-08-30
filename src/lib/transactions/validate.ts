import type { ParameterSpec, StellarComponent } from "@/data/components";
import { isTransactionNetwork, networkLabel } from "@/lib/transactions/networks";
import {
  describeParameterType,
  isSupportedParameterType,
  validateParameterValue,
} from "@/lib/transactions/parameter-types";
import type {
  TransactionRequest,
  TransactionValidationError,
  TransactionValidationResult,
} from "@/lib/transactions/types";

export function validateTransactionRequest(
  request: TransactionRequest,
  components: StellarComponent[],
): TransactionValidationResult {
  const errors: TransactionValidationError[] = [];

  if (!isTransactionNetwork(request.network)) {
    errors.push({
      code: "network.unsupported",
      field: "network",
      message: `Unsupported network: ${networkLabel(request.network)}.`,
    });
  }

  const component = components.find(
    (candidate) => candidate.slug === request.component,
  );

  if (!component) {
    errors.push({
      code: "component.missing",
      field: "component",
      message: "Select an implemented component.",
    });
  } else {
    const networkAvailable =
      request.network === "mainnet"
        ? !!component.capabilities.mainnet
        : request.network === "futurenet"
          ? false
          : component.capabilities.testnet;

    if (!networkAvailable) {
      errors.push({
        code: "component.not-deployed",
        field: "component",
        message: `${component.name} is not available on ${networkLabel(request.network)}. Transactions require a component with a deployed contract on the selected network.`,
      });
    }

    if (!component.interface || component.interface.length === 0) {
      errors.push({
        code: "component.no-interface",
        field: "component",
        message: `${component.name} has no contract interface defined.`,
      });
    }

    const method = component.interface?.find(
      (fn) => fn.name === request.method,
    );

    if (!method) {
      errors.push({
        code: "method.missing",
        field: "method",
        message: "Select a method.",
      });
    } else if (method.name === "__constructor") {
      errors.push({
        code: "method.constructor",
        field: "method",
        message: "The constructor cannot be invoked as a transaction method.",
      });
    } else {
      for (const param of method.params) {
        if (!isSupportedParameterType(param.type)) {
          errors.push({
            code: "parameter.unsupported-type",
            field: param.name,
            message: `Unsupported Soroban parameter type: ${param.type}.`,
          });
          continue;
        }

        const value = request.parameters[param.name];
        if (!value?.trim()) {
          errors.push({
            code: "parameter.missing",
            field: param.name,
            message: "This field is required.",
          });
        } else if (!parameterValueIsValid(param, value)) {
          errors.push({
            code: "parameter.invalid-type",
            field: param.name,
            message: parameterTypeMessage(param.type),
          });
        }
      }
    }
  }

  if (!request.sourceAccount?.trim()) {
    errors.push({
      code: "source-account.missing",
      field: "sourceAccount",
      message: "Source account is required.",
    });
  }

  return { ok: errors.length === 0, errors };
}

function parameterValueIsValid(param: ParameterSpec, rawValue: string): boolean {
  return validateParameterValue(param.type, rawValue);
}

function parameterTypeMessage(type: string): string {
  return describeParameterType(type);
}