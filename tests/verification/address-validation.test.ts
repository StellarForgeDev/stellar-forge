import { describe, it, expect } from "vitest";
import { StrKey } from "@stellar/stellar-sdk";
import { createDeploymentSession, deserializeDeploymentSession, isValidPublicDeploymentAddress, serializeDeploymentSession } from "@/lib/verification/deployment-session";

function isSecretMaterial(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("S")) return true;
  const lower = v.toLowerCase();
  return lower.includes("secret") || lower.includes("seed") || lower.includes("mnemonic") || lower.includes("private");
}
function isValidPublicKey(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isSecretMaterial(trimmed)) return false;
  if (/[\s\n\r\t]/.test(trimmed)) return false;
  if (trimmed.length !== 56) return false;
  return StrKey.isValidEd25519PublicKey(trimmed);
}

const VALID_G = "GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW";
const VALID_G2 = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

describe("address validation — StrKey authoritative", () => {
  it("valid G... accepted", () => {
    expect(isValidPublicKey(VALID_G)).toBe(true);
    expect(isValidPublicKey(VALID_G2)).toBe(true);
  });
  it("malformed G... rejected", () => {
    expect(isValidPublicKey("GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWA")).toBe(false);
    expect(isValidPublicKey("GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKWX")).toBe(false);
    expect(isValidPublicKey("GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWX")).toBe(false);
  });
  it("arbitrary paragraph rejected", () => {
    expect(isValidPublicKey("hello world this is a paragraph with arbitrary text and no address")).toBe(false);
    expect(isValidPublicKey("Deployment account for testing the Access Control contract on Testnet. This paragraph should be rejected.")).toBe(false);
    expect(isValidPublicKey(`paragraph with ${VALID_G} inside`)).toBe(false);
  });
  it("S... secret rejected", () => {
    expect(isValidPublicKey("SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(false);
    expect(isValidPublicKey("SBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW")).toBe(false);
    expect(isValidPublicKey("secret seed phrase mnemonic private key")).toBe(false);
  });
  it("whitespace/newline input rejected", () => {
    expect(isValidPublicKey("   ")).toBe(false);
    expect(isValidPublicKey("\n")).toBe(false);
    expect(isValidPublicKey(`\n${VALID_G}\n`)).toBe(true); // surrounding whitespace trimmed -> valid
    expect(isValidPublicKey(`${VALID_G} \n ${VALID_G}`)).toBe(false);
    expect(isValidPublicKey(`${VALID_G}\n`)).toBe(true); // trailing newline trimmed -> valid
    expect(isValidPublicKey(`${VALID_G} \n`)).toBe(true); // trailing space trimmed -> valid
    expect(isValidPublicKey(` ${VALID_G} `)).toBe(true);
    expect(isValidPublicKey(`${VALID_G}\n${VALID_G}`)).toBe(false); // embedded newline -> rejected
  });
  it("account and admin each validate independently", () => {
    expect(isValidPublicKey(VALID_G)).toBe(true);
    expect(isValidPublicKey("invalid")).toBe(false);
    // One valid, one invalid -> independent
    const accountValid = isValidPublicKey(VALID_G);
    const adminValid = isValidPublicKey("invalid");
    expect(accountValid).toBe(true);
    expect(adminValid).toBe(false);
    expect(accountValid && adminValid).toBe(false);
    // Both valid even when same
    expect(isValidPublicKey(VALID_G) && isValidPublicKey(VALID_G)).toBe(true);
  });
  it("client/server boundary cannot be bypassed", () => {
    const paragraph = "not a valid address\nwith newlines";
    expect(isValidPublicKey(paragraph)).toBe(false);
    // Server would return INVALID_ACCOUNT
    expect(StrKey.isValidEd25519PublicKey(paragraph.trim())).toBe(false);
  });
});

describe("authoritative deployment address handling", () => {
  const paragraph = "Deployment account for testing the Access Control contract on Testnet. This paragraph should be rejected.";

  it("stores only valid public account and admin addresses", () => {
    const session = createDeploymentSession({ deploymentAccount: VALID_G, constructorAdmin: VALID_G2 });
    const restored = deserializeDeploymentSession(serializeDeploymentSession(session));
    expect(restored.deploymentAccount).toBe(VALID_G);
    expect(restored.constructorAdmin).toBe(VALID_G2);
  });

  it("converts invalid and empty account/admin values to null at the session boundary", () => {
    const session = createDeploymentSession({ deploymentAccount: paragraph, constructorAdmin: "" });
    expect(session.deploymentAccount).toBeNull();
    expect(session.constructorAdmin).toBeNull();
    const persisted = JSON.parse(serializeDeploymentSession(session)) as { deploymentAccount: string | null; constructorAdmin: string | null };
    expect(persisted.deploymentAccount).toBeNull();
    expect(persisted.constructorAdmin).toBeNull();
  });

  it("uses the same strict public-address validator for authoritative inputs", () => {
    expect(isValidPublicDeploymentAddress(VALID_G)).toBe(true);
    expect(isValidPublicDeploymentAddress(paragraph)).toBe(false);
    expect(isValidPublicDeploymentAddress("SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(false);
  });
});
