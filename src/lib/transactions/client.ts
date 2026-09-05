import type {
  BlockedTransaction,
  FailedTransaction,
  PreparedTransaction,
  TransactionPreparationResult,
  TransactionRequest,
  TransactionSubmissionError,
  TransactionSubmissionResult,
} from "@/lib/transactions/types";
import type { TransactionNetwork } from "@/lib/transactions/networks";

export interface SubmitSignedTransactionInput {
  network: TransactionNetwork;
  signedXdr: string;
  controlledDeployment?: boolean;
}

export type SubmitSignedTransactionResult =
  | { ok: true; submission: TransactionSubmissionResult }
  | { ok: false; error: TransactionSubmissionError };

export async function submitSignedTransaction(
  input: SubmitSignedTransactionInput,
): Promise<SubmitSignedTransactionResult> {
  try {
    const response = await fetch("/api/transactions/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const payload: unknown = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: submissionErrorFromPayload(payload, "The submission service could not be reached."),
      };
    }

    if (isSubmitOkPayload(payload)) {
      return { ok: true, submission: payload.submission };
    }

    return {
      ok: false,
      error: {
        code: "input.invalid",
        message: "The submission service returned an unexpected response.",
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "rpc-unavailable",
        message: "Could not reach the submission service.",
      },
    };
  }
}

function isSubmitOkPayload(
  value: unknown,
): value is { ok: true; submission: TransactionSubmissionResult } {
  return (
    isRecord(value) &&
    value.ok === true &&
    isRecord(value.submission) &&
    (value.submission.status === "PENDING" ||
      value.submission.status === "SUCCESS" ||
      value.submission.status === "FAILED") &&
    typeof value.submission.transactionHash === "string"
  );
}

function submissionErrorFromPayload(
  payload: unknown,
  fallbackMessage: string,
): TransactionSubmissionError {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    typeof payload.error.code === "string" &&
    typeof payload.error.message === "string"
  ) {
    return {
      code: payload.error.code as TransactionSubmissionError["code"],
      message: payload.error.message,
      ...(typeof payload.error.detail === "string"
        ? { detail: payload.error.detail }
        : {}),
    };
  }
  return { code: "input.invalid", message: fallbackMessage };
}

export async function prepareTransactionRequest(
  request: TransactionRequest,
): Promise<TransactionPreparationResult> {
  try {
    const response = await fetch("/api/transactions/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    const payload: unknown = await response.json();

    if (!response.ok) {
      return {
        status: "failed",
        request,
        errors: [],
        preparationError: {
          code: "rpc-unavailable",
          message: "The preparation service could not be reached.",
        },
      };
    }

    if (isPreparedResult(payload)) {
      return payload;
    }
    if (isFailedResult(payload)) {
      return payload;
    }
    if (isBlockedResult(payload)) {
      return payload as BlockedTransaction;
    }

    return {
      status: "failed",
      request,
      errors: [],
      preparationError: {
        code: "rpc-unavailable",
        message: "The preparation service returned an unexpected response.",
      },
    };
  } catch {
    return {
      status: "failed",
      request,
      errors: [],
      preparationError: {
        code: "rpc-unavailable",
        message: "Could not reach the preparation service.",
      },
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPreparedResult(value: unknown): value is PreparedTransaction {
  return (
    isRecord(value) &&
    value.status === "prepared" &&
    isRecord(value.simulation) &&
    value.simulation.success === true
  );
}

function isFailedResult(value: unknown): value is FailedTransaction {
  return isRecord(value) && value.status === "failed";
}

function isBlockedResult(value: unknown): value is { status: "blocked" } {
  return isRecord(value) && value.status === "blocked";
}
