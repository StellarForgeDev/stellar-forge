"use client";

import { useCallback, useEffect, useState } from "react";
import { freighterAdapter } from "@/lib/wallet/freighter";
import type {
  WalletAdapter,
  WalletSignResult,
  WalletState,
} from "@/lib/wallet/types";
import { isUsableWalletConnection } from "@/lib/wallet/validation";

export type { WalletState, WalletStatus } from "@/lib/wallet/types";

const disconnectedState: WalletState = {
  status: "disconnected",
  address: null,
  networkName: null,
  networkPassphrase: null,
  error: null,
};

function invalidConnectionState(): WalletState {
  return {
    ...disconnectedState,
    error: { code: "wallet-unavailable", message: "Wallet returned an invalid public account or network." },
  };
}

export function useWallet(
  adapter: WalletAdapter = freighterAdapter,
  options: { autoRestore?: boolean } = {},
): {
  state: WalletState;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTransaction: (
    xdr: string,
    expectedSourceAccount: string,
  ) => Promise<WalletSignResult>;
} {
  const [state, setState] = useState<WalletState>(() => options.autoRestore === false ? disconnectedState : {
    status: "checking",
    address: null,
    networkName: null,
    networkPassphrase: null,
    error: null,
  });

  useEffect(() => {
    if (options.autoRestore === false) {
      return;
    }
    let cancelled = false;
    let changeVersion = 0;

    async function restoreConnection() {
      const available = await adapter.isAvailable();
      if (cancelled || changeVersion !== 0) return;

      if (!available) {
        setState({
          status: "unavailable",
          address: null,
          networkName: null,
          networkPassphrase: null,
          error: null,
        });
        return;
      }

      const result = await adapter.getConnection();
      if (cancelled || changeVersion !== 0) return;

      if (result.ok && isUsableWalletConnection(result.connection)) {
        setState({
          status: "connected",
          address: result.connection.address,
          networkName: result.connection.network.name,
          networkPassphrase: result.connection.network.passphrase,
          error: null,
        });
      } else {
        setState(result.ok ? invalidConnectionState() : disconnectedState);
      }
    }

    void restoreConnection();

    const unsubscribe = adapter.subscribe((change) => {
      if (cancelled) return;
      changeVersion += 1;
      if (change.type === "connected" && isUsableWalletConnection(change.connection)) {
        setState({
          status: "connected",
          address: change.connection.address,
          networkName: change.connection.network.name,
          networkPassphrase: change.connection.network.passphrase,
          error: null,
        });
      } else {
        setState(change.type === "connected" ? invalidConnectionState() : disconnectedState);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [adapter, options.autoRestore]);

  const connect = useCallback(async () => {
    setState((previous) => ({ ...previous, status: "connecting", error: null }));

    const result = await adapter.connect();
    if (result.ok && isUsableWalletConnection(result.connection)) {
      setState({
        status: "connected",
        address: result.connection.address,
        networkName: result.connection.network.name,
        networkPassphrase: result.connection.network.passphrase,
        error: null,
      });
    } else {
      setState({
        status: "disconnected",
        address: null,
        networkName: null,
        networkPassphrase: null,
        error: result.ok ? invalidConnectionState().error : result.error,
      });
    }
  }, [adapter]);

  const disconnect = useCallback(() => {
    void adapter.disconnect();
    setState(disconnectedState);
  }, [adapter]);

  const signTransaction = useCallback(
    async (
      xdr: string,
      expectedSourceAccount: string,
    ): Promise<WalletSignResult> => {
      if (
        state.status !== "connected" ||
        !state.address ||
        !state.networkPassphrase
      ) {
        return {
          ok: false,
          error: {
            code: "wallet-unavailable",
            message: "No wallet is connected. Connect a wallet before signing.",
          },
        };
      }

      const result = await adapter.signTransaction(xdr, {
        networkPassphrase: state.networkPassphrase,
        address: state.address,
      });

      if (!result.ok) return result;

      if (result.signed.signerAddress !== expectedSourceAccount) {
        return {
          ok: false,
          error: {
            code: "signer-mismatch",
            message: `The transaction was signed by ${result.signed.signerAddress}, but the transaction source account is ${expectedSourceAccount}.`,
          },
        };
      }

      return result;
    },
    [adapter, state.address, state.networkPassphrase, state.status],
  );

  return { state, connect, disconnect, signTransaction };
}
