import { describe, expect, it } from "vitest";
import {
  isTransactionNetwork,
  networkConfig,
  NETWORK_CONFIGS,
} from "@/lib/transactions/networks";

describe("network configuration", () => {
  it("supports testnet as valid", () => {
    expect(isTransactionNetwork("testnet")).toBe(true);
    const config = networkConfig("testnet");
    expect(config.id).toBe("testnet");
    expect(config.label).toBe("Stellar Testnet");
    expect(config.rpcUrl).toBe("https://soroban-testnet.stellar.org");
    expect(config.passphrase).toBe("Test SDF Network ; September 2015");
    expect(config.explorerUrl).toBe("https://stellar.expert/explorer/testnet");
  });

  it("supports mainnet as valid", () => {
    expect(isTransactionNetwork("mainnet")).toBe(true);
    const config = networkConfig("mainnet");
    expect(config.id).toBe("mainnet");
    expect(config.label).toBe("Stellar Mainnet");
    expect(config.rpcUrl).toBe("https://soroban-mainnet.stellar.org");
    expect(config.passphrase).toBe(
      "Public Global Stellar Network ; September 2015",
    );
    expect(config.explorerUrl).toBe(
      "https://stellar.expert/explorer/public",
    );
  });

  it("supports futurenet as valid", () => {
    expect(isTransactionNetwork("futurenet")).toBe(true);
    const config = networkConfig("futurenet");
    expect(config.id).toBe("futurenet");
    expect(config.label).toBe("Stellar Futurenet");
    expect(config.rpcUrl).toBe("https://rpc-futurenet.stellar.org");
    expect(config.explorerUrl).toBe(
      "https://stellar.expert/explorer/futurenet",
    );
  });

  it("rejects unknown networks", () => {
    expect(isTransactionNetwork("bogus")).toBe(false);
    expect(isTransactionNetwork("")).toBe(false);
    expect(isTransactionNetwork(null)).toBe(false);
  });

  it("contains exactly testnet, mainnet, futurenet", () => {
    expect(Object.keys(NETWORK_CONFIGS).sort()).toEqual([
      "futurenet",
      "mainnet",
      "testnet",
    ]);
  });
});
