import type {
  WalletAdapter,
  WalletChange,
  WalletConnectResult,
  WalletError,
  WalletSignResult,
} from "@/lib/wallet/types";
import { isUsableWalletConnection } from "@/lib/wallet/validation";

type FreighterModule = typeof import("@stellar/freighter-api");

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

async function loadFreighter(): Promise<FreighterModule | null> {
  if (!isBrowser()) return null;
  try {
    return await import("@stellar/freighter-api");
  } catch {
    return null;
  }
}

function unavailable(message: string): WalletError {
  return { code: "wallet-unavailable", message };
}

export const freighterAdapter: WalletAdapter = {
  id: "freighter",
  name: "Freighter",

  async isAvailable(): Promise<boolean> {
    const api = await loadFreighter();
    if (!api) return false;
    try {
      const result = await api.isConnected();
      if (result.error) return false;
      return result.isConnected;
    } catch {
      return false;
    }
  },

  async connect(): Promise<WalletConnectResult> {
    const api = await loadFreighter();
    if (!api) {
      return {
        ok: false,
        error: unavailable(
          "Freighter is not installed. Install the Freighter browser extension to connect a wallet.",
        ),
      };
    }

    try {
      const access = await api.requestAccess();
      if (access.error) {
        return {
          ok: false,
          error: {
            code: "wallet-rejected",
            message: access.error.message || "Wallet connection was rejected.",
            detail: access.error.ext?.join(", "),
          },
        };
      }

      const network = await api.getNetworkDetails();
      if (network.error) {
        return {
          ok: false,
          error: unavailable(
            "Freighter connected, but its network details could not be read.",
          ),
        };
      }

      const connection = {
        address: access.address,
        network: {
          name: network.network,
          passphrase: network.networkPassphrase,
        },
      };
      if (!isUsableWalletConnection(connection)) {
        return {
          ok: false,
          error: unavailable("Freighter returned an invalid wallet connection."),
        };
      }
      return {
        ok: true,
        connection,
      };
    } catch {
      return {
        ok: false,
        error: { code: "unknown", message: "Unexpected wallet connection error." },
      };
    }
  },

  async disconnect(): Promise<void> {
    return;
  },

  async getConnection(): Promise<WalletConnectResult> {
    const api = await loadFreighter();
    if (!api) {
      return { ok: false, error: unavailable("Freighter is not available.") };
    }

    try {
      const connected = await api.isConnected();
      if (connected.error || !connected.isConnected) {
        return { ok: false, error: unavailable("No wallet is connected.") };
      }

      const address = await api.getAddress();
      if (address.error) {
        return { ok: false, error: unavailable("Wallet address could not be read.") };
      }

      const network = await api.getNetworkDetails();
      if (network.error) {
        return { ok: false, error: unavailable("Wallet network could not be read.") };
      }

      const connection = {
        address: address.address,
        network: {
          name: network.network,
          passphrase: network.networkPassphrase,
        },
      };
      if (!isUsableWalletConnection(connection)) {
        return { ok: false, error: unavailable("Freighter returned an invalid wallet connection.") };
      }
      return {
        ok: true,
        connection,
      };
    } catch {
      return {
        ok: false,
        error: { code: "unknown", message: "Unexpected wallet read error." },
      };
    }
  },

  async signTransaction(
    xdr: string,
    options,
  ): Promise<WalletSignResult> {
    const api = await loadFreighter();
    if (!api) {
      return { ok: false, error: unavailable("Freighter is not available.") };
    }

    try {
      const result = await api.signTransaction(xdr, {
        networkPassphrase: options.networkPassphrase,
        address: options.address,
      });

      if (result.error) {
        return {
          ok: false,
          error: {
            code: "wallet-rejected",
            message: result.error.message || "Transaction signing was rejected.",
            detail: result.error.ext?.join(", "),
          },
        };
      }

      if (!result.signedTxXdr) {
        return {
          ok: false,
          error: { code: "unknown", message: "Wallet returned no signed transaction." },
        };
      }

      if (options.address && result.signerAddress !== options.address) {
        return {
          ok: false,
          error: {
            code: "signer-mismatch",
            message: `The transaction was signed by ${result.signerAddress}, not the connected account ${options.address}.`,
          },
        };
      }

      return {
        ok: true,
        signed: {
          signedXdr: result.signedTxXdr,
          signerAddress: result.signerAddress,
        },
      };
    } catch {
      return {
        ok: false,
        error: { code: "unknown", message: "Unexpected wallet signing error." },
      };
    }
  },

  subscribe(onChange: (change: WalletChange) => void): () => void {
    let stopped = false;
    let watcher: { stop(): void } | null = null;

    void loadFreighter().then((api) => {
      if (stopped || !api) return;

      const instance = new api.WatchWalletChanges(2000);
      const watched = instance.watch((params) => {
        if (!params || params.error) {
          // The extension reported an error (e.g. the user revoked access
          // or locked it). Transition the app to the disconnected state
          // instead of staying stuck on the last "connected" value.
          onChange({ type: "disconnected" });
          return;
        }
        const connection = {
          address: params.address,
          network: {
            name: params.network,
            passphrase: params.networkPassphrase,
          },
        };
        if (!isUsableWalletConnection(connection)) {
          onChange({ type: "disconnected" });
          return;
        }
        onChange({
          type: "connected",
          connection,
        });
      });
      if (watched.error) return;
      watcher = instance;
    });

    return () => {
      stopped = true;
      watcher?.stop();
    };
  },
};
