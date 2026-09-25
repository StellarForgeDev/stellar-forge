import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const panelPath = path.join(process.cwd(), "src/components/testnet/ControlledDeploymentPanel.tsx");

describe("ControlledDeploymentPanel wallet/deployment-account invariant", () => {
  const source = readFileSync(panelPath, "utf8");

  it("connects through the existing wallet adapter while disconnected", () => {
    expect(source).toContain("onClick={() => void wallet.connect()}");
    expect(source).toContain('wallet.state.status === "connecting"');
  });

  it("offers an explicit connected-wallet binding", () => {
    expect(source).toContain("Use connected wallet");
    expect(source).toContain("const address = wallet.state.address");
    expect(source).toContain("setDeploymentAccount(address)");
    expect(source).toContain("setAccountInspection(null)");
  });

  it("keeps reconnect available when the connected state has no valid address", () => {
    expect(source).toContain("const walletAddress = isValidWalletAddress(wallet.state.address) ? wallet.state.address : null");
    expect(source).toContain("const walletAddressValid = wallet.state.status === \"connected\" && walletAddress !== null");
    expect(source).toContain("wallet.state.status === \"connected\" ? \"Reconnect wallet\" : \"Connect wallet explicitly\"");
    expect(source).toContain("{walletAddressValid ? (");
  });

  it("refreshes with the explicit address rather than stale deployment state", () => {
    expect(source).toContain("refreshAuthoritativeState(accountOverride?: string)");
    expect(source).toContain("const effectiveDeployer = (accountOverride ?? deployer).trim()");
    expect(source).toContain('if (effectiveDeployer) query.set("account", effectiveDeployer)');
    expect(source).toContain("account: effectiveDeployer || null");
    expect(source).toContain("void refreshAuthoritativeState(address)");
  });

  it("retains the mismatched wallet/deployment-account guard", () => {
    expect(source).toContain("wallet.state.address !== deployer");
  });

  it("preserves the Transaction Builder connected-wallet source", () => {
    const builder = readFileSync(path.join(process.cwd(), "src/components/transactions/TransactionBuilder.tsx"), "utf8");
    expect(builder).toContain("sourceAccount:");
    expect(builder).toContain('wallet.state.status === "connected"');
    expect(builder).toContain('wallet.state.address ?? ""');
  });

  it("preserves the existing wallet network/signing guard", () => {
    expect(source).toContain("wallet.state.networkPassphrase !== testnetPassphrase");
    expect(source).toContain("wallet.signTransaction(result.transactionXdr, deployer)");
  });

  describe("Targeted Testnet Deploy State Fixes", () => {
    it("Test A: signing blocked on wallet/account mismatch (revalidation immediately before signing)", () => {
      // Must explicitly check in signStage
      expect(source).toMatch(/async function signStage[\s\S]*?if\s*\(\s*wallet\.state\.address\s*!==\s*deployer\s*\)\s*\{\s*setError\("Connected wallet does not match/);
    });

    it("Test B: changing deployment account invalidates stale preparation", () => {
      // Must have invalidation logic attached to deployment account change
      expect(source).toMatch(/function handleDeploymentAccountChange[\s\S]*?invalidateStalePreparation/);
      expect(source).toContain("onChange={(event) => handleDeploymentAccountChange(event.target.value)}");
    });

    it("Test C: changing constructor admin invalidates stale preparation", () => {
      // Must have invalidation logic attached to admin change
      expect(source).toMatch(/function handleAdminChange[\s\S]*?invalidateStalePreparation/);
      expect(source).toContain("onChange={(event) => handleAdminChange(event.target.value)}");
    });

    it("Test D: valid unchanged state still works", () => {
      // Must preserve existing wallet.signTransaction
      expect(source).toContain("wallet.signTransaction(result.transactionXdr, deployer)");
      // Explicit submission/signing controls still enabled based on confirmed state
      expect(source).toContain("disabled={!confirmed}");
    });
  });
});
