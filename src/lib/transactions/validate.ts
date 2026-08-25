import type { ParameterSpec, StellarComponent } from "@/data/components";
import { isTransactionNetwork, networkLabel } from "@/lib/transactions/networks";
import { isSupportedParameterType } from "@/lib/transactions/parameter-types";
import type {
  TransactionRequest,
  TransactionValidationError,
  TransactionValidationResult,
} from "@/lib/transactions/types";

const INTEGER_PATTERN = /^-?\d+$/;
const UNSIGNED_PATTERN = /^\d+$/;
const U32_MAX = 4294967295;
const I128_MIN = -(BigInt(2) ** BigInt(127));
const I128_MAX = BigInt(2) ** BigInt(127) - BigInt(1);

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
    if (!component.capabilities.testnet) {
      errors.push({
        code: "component.not-deployed",
        field: "component",
        message: `${component.name} is not available on Testnet. Transactions require a component with a deployed Testnet contract.`,
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
  const value = rawValue.trim();

  switch (param.type) {
    case "i128":
      if (!INTEGER_PATTERN.test(value)) return false;
      try {
        const n = BigInt(value);
        return n >= I128_MIN && n <= I128_MAX;
      } catch {
        return false;
      }
    case "u32":
      return UNSIGNED_PATTERN.test(value) && Number(value) <= U32_MAX;
    case "Address":
    case "MuxedAddress":
      return value.startsWith("G") || value.startsWith("M");
    default:
      return value.length > 0;
  }
}

function parameterTypeMessage(type: string): string {
  switch (type) {
    case "i128":
      return "Expected an integer between -2^127 and 2^127-1.";
    case "u32":
      return "Expected an unsigned 32-bit integer (0-4294967295).";
    case "Address":
    case "MuxedAddress":
      return "Expected a Stellar address starting with G or M.";
    default:
      return `Value is not valid for the declared type (${type}).`;
  }
}