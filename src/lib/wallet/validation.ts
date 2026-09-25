import { StrKey } from "@stellar/stellar-sdk";
import type { WalletConnection } from "@/lib/wallet/types";

export function isValidWalletAddress(value: unknown): value is string {
  return typeof value === "string"
    && value.length === 56
    && value === value.trim()
    && !/[\s\n\r\t]/.test(value)
    && StrKey.isValidEd25519PublicKey(value);
}

export function isUsableWalletConnection(value: unknown): value is WalletConnection {
  if (!value || typeof value !== "object") return false;
  const connection = value as Partial<WalletConnection>;
  const network = connection.network;
  return isValidWalletAddress(connection.address)
    && Boolean(network)
    && typeof network?.name === "string"
    && network.name.length > 0
    && typeof network?.passphrase === "string"
    && network.passphrase.length > 0;
}
