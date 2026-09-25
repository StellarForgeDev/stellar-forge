import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isUsableWalletConnection, isValidWalletAddress } from "@/lib/wallet/validation";

const validAddress = "GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW";

describe("wallet connection validation", () => {
  it("accepts only a valid exact public G address", () => {
    expect(isValidWalletAddress(validAddress)).toBe(true);
    expect(isValidWalletAddress("invalid")).toBe(false);
    expect(isValidWalletAddress("SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(false);
    expect(isValidWalletAddress(`${validAddress} `)).toBe(false);
  });

  it("rejects partial wallet connection data", () => {
    expect(isUsableWalletConnection({ address: validAddress, network: { name: "Testnet", passphrase: "" } })).toBe(false);
    expect(isUsableWalletConnection({ address: "invalid", network: { name: "Testnet", passphrase: "test" } })).toBe(false);
  });

  it("accepts a complete usable connection", () => {
    expect(isUsableWalletConnection({ address: validAddress, network: { name: "Testnet", passphrase: "Test SDF Network ; September 2015" } })).toBe(true);
  });

  it("guards hook state and invalidates stale restoration after a watcher change", () => {
    const source = readFileSync(path.join(process.cwd(), "src/lib/wallet/useWallet.ts"), "utf8");
    expect(source).toContain("result.ok && isUsableWalletConnection(result.connection)");
    expect(source).toContain("change.type === \"connected\" && isUsableWalletConnection(change.connection)");
    expect(source).toContain("changeVersion !== 0");
  });
});
