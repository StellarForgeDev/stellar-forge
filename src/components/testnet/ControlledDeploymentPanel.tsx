"use client";

import { useEffect, useState } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { useWallet } from "@/lib/wallet/useWallet";
import { submitSignedTransaction } from "@/lib/transactions/client";
import { Button } from "@/components/ui/Button";
import { ACCESS_CONTROL_WORKFLOW } from "@/lib/verification/network-workflow";
import { networkConfig } from "@/lib/transactions/networks";
import { canRecordDeploymentEvidence, canSignDeployment, canSubmitDeployment, canPrepareCreate, canSimulateCreate, canSimulateUpload } from "@/lib/verification/deployment-guards";
import {
  createDeploymentSession,
  getAllowedDeploymentTransitions,
  getDeploymentSessionRecoveryState,
  getNextAllowedOperatorAction,
  restoreDeploymentSession,
  transitionDeploymentSession,
} from "@/lib/verification/deployment-session";
import { clearDeploymentSession, saveDeploymentSession } from "@/lib/verification/deployment-session-persistence";
import { serializeDeploymentSession } from "@/lib/verification/deployment-session";

type StageResult = { transactionXdr: string; simulation: { status: string; error?: string }; artifact: { path: string; sha256: string }; constructorArgs: Record<string, string> };
type ReadinessResult = { finalReadiness?: string; blockingCategory?: string | null; blockingReason?: string | null; recommendedAction?: string | null; gates?: Record<string, { status: string; blockingReason?: string }> };

export function ControlledDeploymentPanel({ artifactHash, artifactPath, artifactVerified: artifactEvidenceVerified, connectivityHealthy }: { artifactHash: string | null; artifactPath: string; artifactVerified: boolean; connectivityHealthy: boolean }) {
  // Detect an existing public wallet connection; deployment authorization remains explicit.
  const wallet = useWallet(undefined, { autoRestore: true });
  const [deploymentAccount, setDeploymentAccount] = useState("");
  const [accountInspection, setAccountInspection] = useState<{ status: string; exists: boolean | null; sufficientBalance: boolean | null; sequenceNumber: string | null; nativeBalance: string | null } | null>(null);
  const [admin, setAdmin] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [stage, setStage] = useState<"idle" | "preparing" | "prepared" | "simulated" | "awaiting-confirmation" | "signing" | "signed" | "submitting" | "confirmed" | "failed">("idle");
  const [upload, setUpload] = useState<StageResult | null>(null);
  const [uploadHash, setUploadHash] = useState<string | null>(null);
  const [createHash, setCreateHash] = useState<string | null>(null);
  const [signedUpload, setSignedUpload] = useState<string | null>(null);
  const [signedCreate, setSignedCreate] = useState<string | null>(null);
  const [create, setCreate] = useState<StageResult | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [deployedHash, setDeployedHash] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deploymentSession, setDeploymentSession] = useState(() => createDeploymentSession({ artifactHash, deploymentAccount: null, constructorAdmin: null }));
  const [restorationStatus, setRestorationStatus] = useState<"RESTORED" | "RECONCILIATION_REQUIRED" | "RECONCILED" | "INVALID_PERSISTENCE" | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [sessionReconciled, setSessionReconciled] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [lastObservedDisplay, setLastObservedDisplay] = useState<string>("—");
  const [pendingRequiresInspection, setPendingRequiresInspection] = useState(false);
  const [hasInspectedSincePending, setHasInspectedSincePending] = useState(false);
  const [pendingHash, setPendingHash] = useState<string | null>(null);

  useEffect(() => {
    // hydration-safe: defer timestamp display until client mount
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hasMounted is intentional for SSR/client determinism
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (hasMounted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync authoritative session time to display after mount
      setLastObservedDisplay(deploymentSession.lastObservedAt);
    }
  }, [hasMounted, deploymentSession.lastObservedAt]);
  const deployer = deploymentAccount.trim();
  const testnetPassphrase = networkConfig("testnet").passphrase;
  const testnetEndpoint = networkConfig("testnet").rpcUrl;

  // Persistence: load on mount, save on change, clear explicitly only
  useEffect(() => {
    try {
      const raw = localStorage.getItem("stellar-forge:deployment-session:v29");
      if (raw) {
        const restored = restoreDeploymentSession(raw);
        if (restored.status === "RESTORED" && restored.session) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setDeploymentSession(restored.session);
          setSessionReconciled(false);
          setRestorationStatus("RESTORED");
        } else if (restored.status === "INVALID_PERSISTENCE") {
          setRestorationStatus("INVALID_PERSISTENCE");
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      saveDeploymentSession(deploymentSession);
    } catch {}
  }, [deploymentSession]);

  async function refreshAuthoritativeState() {
    setError(null);
    const query = new URLSearchParams();
    if (deployer) query.set("account", deployer);
    if (admin.trim()) query.set("admin", admin.trim());
    try {
      const [readinessResponse, reconciliationResponse] = await Promise.all([
        fetch(`/api/testnet/readiness?${query.toString()}`, { cache: "no-store" }),
        fetch("/api/testnet/deployment-session/reconcile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          serialized: serializeDeploymentSession(deploymentSession),
          account: deployer || null,
          admin: admin.trim() || null,
          uploadRecovery: deploymentSession.state === "UPLOAD_SIGNED" ? {
            signedTransactionAvailable: Boolean(signedUpload),
            uploadHash: uploadHash ?? deploymentSession.transactionHashes.upload ?? null,
            pendingHash,
            submissionEvidence: !signedUpload && !uploadHash && !pendingHash && !deploymentSession.transactionHashes.upload
              ? "NO_SUBMISSION_RECORDED"
              : "UNKNOWN",
          } : undefined,
        }), cache: "no-store" }),
      ]);
      const readinessPayload = await readinessResponse.json() as ReadinessResult;
      const reconciliationPayload = await reconciliationResponse.json() as { session?: import("@/lib/verification/deployment-session").DeploymentSession; error?: string };
      if (readinessResponse.ok) setReadiness(readinessPayload);
      if (!reconciliationResponse.ok || !reconciliationPayload.session) throw new Error(reconciliationPayload.error ?? "Authoritative session reconciliation failed.");
      setDeploymentSession(reconciliationPayload.session);
      setSessionReconciled(true);
      setRestorationStatus("RECONCILED");
      if (pendingRequiresInspection) setHasInspectedSincePending(true);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Authoritative readiness refresh failed.");
    }
  }

  function advanceSession(states: import("@/lib/verification/deployment-session").DeploymentSessionState[], context: Partial<import("@/lib/verification/deployment-session").DeploymentSessionSnapshot> = {}, baseSession = deploymentSession): import("@/lib/verification/deployment-session").DeploymentSession | null {
    let next = baseSession;
    for (const state of states) {
      const result = transitionDeploymentSession(next, state, context);
      if (!("session" in result)) { setError(result.error); return null; }
      next = result.session;
    }
    setDeploymentSession(next);
    return next;
  }

  // Secret rejection helper (Phase 22 Step 3 + 4)
  function isSecretMaterial(value: string): boolean {
    const v = value.trim();
    if (!v) return false;
    if (v.startsWith("S")) return true;
    const lower = v.toLowerCase();
    return lower.includes("secret") || lower.includes("seed") || lower.includes("mnemonic") || lower.includes("private");
  }

  function isValidPublicKey(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (isSecretMaterial(trimmed)) return false;
    if (/[\s\n\r\t]/.test(trimmed)) return false;
    if (trimmed.includes("\n") || trimmed.includes("\r")) return false;
    // Must be exact single G... address, no embedded whitespace or extra content
    if (trimmed.length !== 56) return false;
    return StrKey.isValidEd25519PublicKey(trimmed);
  }

  async function prepare(nextStage: "upload" | "create") {
    setError(null); setStage("preparing");
    if (isSecretMaterial(admin) || !isValidPublicKey(admin)) { setError("Constructor admin must be a valid public G... address (StrKey). Arbitrary text, S... secrets, and whitespace are rejected."); setStage("failed"); return; }
    if (!deployer || !adminTrimmed) { setError("Provide both the deployment account and constructor admin public addresses."); setStage("failed"); return; }
    if (!isValidPublicKey(deploymentAccount)) { setError("Deployment account must be a valid public G... address (StrKey). Arbitrary text, S... secrets, and whitespace are rejected."); setStage("failed"); return; }
    if (!wallet.state.address || wallet.state.address !== deployer) { setError("Connect the wallet explicitly and ensure it matches the supplied deployment account."); setStage("failed"); return; }
    if (isSecretMaterial(deployer)) { setError("Secret material rejected for deployer."); setStage("failed"); return; }
    if (nextStage === "upload" && (!sessionReconciled || deploymentSession.state !== "PREFLIGHT_READY" || readiness?.finalReadiness !== "READY_FOR_CONTROLLED_TESTNET_DEPLOYMENT")) { setError(`Upload preparation is blocked by authoritative readiness: ${deploymentSession.state} / ${readiness?.finalReadiness ?? "NOT_REFRESHED"}`); setStage("failed"); return; }
    if (nextStage === "create" && deploymentSession.state !== "UPLOAD_CONFIRMED") { setError(`Creation preparation is blocked until authoritative upload confirmation: ${deploymentSession.state}`); setStage("failed"); return; }
    // Simulation boundary: create preparation requires upload simulation to be valid (Phase 22 Step 6)
    if (nextStage === "create" && (!upload || upload.simulation.status !== "SUCCESS")) { setError("Upload simulation must be valid before preparing contract creation."); setStage("failed"); return; }
    if (nextStage === "create" && !canPrepareCreate({ uploadSimulated: Boolean(upload && upload.simulation.status === "SUCCESS"), uploadConfirmed: Boolean(uploadHash) })) { setError("Stage B must never be prepared until Stage A upload confirmation is established."); setStage("failed"); return; }
    const response = await fetch("/api/transactions/deploy/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ network: "testnet", component: ACCESS_CONTROL_WORKFLOW.componentId, stage: nextStage, sourceAccount: deployer, constructorArgs: { admin }, ...(nextStage === "create" ? { uploadTransactionHash: uploadHash } : {}) }) });
    const result = await response.json() as StageResult & { error?: string };
    if (!response.ok) { setError(result.error ?? "Deployment preparation failed."); setStage("failed"); return; }
    // Stage progression: PREPARED -> SIMULATED -> AWAITING_USER_CONFIRMATION (stop before signing)
    if (nextStage === "upload") {
      if (!canSimulateUpload({ prepared: true })) { setError("Simulation not allowed before preparation."); setStage("failed"); return; }
      setUpload(result);
    } else {
      if (!canSimulateCreate({ createPrepared: true, uploadSimulated: Boolean(upload && upload.simulation.status === "SUCCESS") })) { setError("Creation simulation blocked before upload simulation."); setStage("failed"); return; }
      setCreate(result);
    }
    setStage("prepared");
    // Explicitly mark simulated only after verifying simulation success; do not auto-sign
    if (result.simulation?.status === "SUCCESS") {
      const states = nextStage === "upload"
        ? ["UPLOAD_PREPARED", "UPLOAD_SIMULATED", "AWAITING_UPLOAD_CONFIRMATION"] as const
        : ["CREATE_PREPARED", "CREATE_SIMULATED", "AWAITING_CREATE_CONFIRMATION"] as const;
      if (!advanceSession([...states], { artifactHash: result.artifact.sha256, simulationStatus: "SIMULATED", deploymentAccount: deployer, constructorAdmin: admin })) { setStage("failed"); return; }
      setStage("simulated");
      // Awaiting user confirmation is required before any signing; UI clearly shows this state
      setStage("awaiting-confirmation");
    } else { setError(result.simulation?.error ?? "Simulation required before confirmation. SIMULATION_UNAVAILABLE"); setStage("failed"); return; }
  }

  async function signStage(result: StageResult, nextStage: "upload" | "create") {
    if (!sessionReconciled || deploymentSession.state !== (nextStage === "upload" ? "AWAITING_UPLOAD_CONFIRMATION" : "AWAITING_CREATE_CONFIRMATION") || readiness?.finalReadiness !== "READY_FOR_CONTROLLED_TESTNET_DEPLOYMENT" || !wallet.state.address || wallet.state.networkPassphrase !== testnetPassphrase) { setError("Live signing is blocked until the authoritative session and readiness gates genuinely pass."); return; }
    if (!canSignDeployment({ status: "AWAITING_CONFIRMATION", userConfirmed: confirmed, simulationPassed: result.simulation.status === "SUCCESS", signedTransactionAvailable: false, uploadConfirmed: Boolean(uploadHash), creationConfirmed: false, contractId, artifactVerified: false }) || !deployer) return;
    setError(null); setStage("signing");
    const signed = await wallet.signTransaction(result.transactionXdr, deployer);
    if (!signed.ok) { setError(signed.error.message); setStage("failed"); return; }
    if (nextStage === "upload") setSignedUpload(signed.signed.signedXdr); else setSignedCreate(signed.signed.signedXdr);
    if (!advanceSession([nextStage === "upload" ? "UPLOAD_SIGNED" : "CREATE_SIGNED"], { deploymentAccount: deployer, constructorAdmin: admin })) { setStage("failed"); return; }
    setStage("signed");
  }

  async function submitStage(nextStage: "upload" | "create") {
    const signedXdr = nextStage === "upload" ? signedUpload : signedCreate;
    if (!wallet.state.address || wallet.state.networkPassphrase !== testnetPassphrase) { setError("Submission is blocked unless the connected wallet remains on Stellar Testnet."); return; }
    if (pendingRequiresInspection && !hasInspectedSincePending) {
      setError("Read-only inspection required before another submission. Please inspect the pending transaction and reconcile. Re-broadcasting without inspection is blocked.");
      return;
    }
    const signedState = nextStage === "upload" ? "UPLOAD_SIGNED" : "CREATE_SIGNED";
    if (!sessionReconciled || deploymentSession.state !== signedState || !canSubmitDeployment({ status: "AWAITING_CONFIRMATION", userConfirmed: confirmed, simulationPassed: true, signedTransactionAvailable: Boolean(signedXdr), uploadConfirmed: Boolean(uploadHash), creationConfirmed: false, contractId, artifactVerified: false }) || !signedXdr) return;
    setError(null); setStage("submitting");
    const submitted = await submitSignedTransaction({ network: "testnet", signedXdr, controlledDeployment: true });
    if (submitted.ok && submitted.submission.status === "PENDING") {
      setPendingHash(submitted.submission.transactionHash);
      setPendingRequiresInspection(true);
      setHasInspectedSincePending(false);
      setError(`Transaction submitted but not yet confirmed (PENDING). Hash: ${submitted.submission.transactionHash}. Please inspect/reconcile before attempting another broadcast. Re-broadcasting the same signed transaction is safe only after inspection.`);
      setStage("failed");
      return;
    }
    if (!submitted.ok && (submitted.error.code === "envelope.expired" || submitted.error.code === "envelope.future-expiration")) {
      // Expired before submission: never broadcast, discard signed XDR, move to recoverable FAILED
      if (nextStage === "upload") setSignedUpload(null);
      else setSignedCreate(null);
      setPendingHash(null);
      setPendingRequiresInspection(false);
      setHasInspectedSincePending(false);
      advanceSession(["FAILED"], {
        failure: {
          stage: deploymentSession.state,
          classification: "SIMULATION_FAILED",
          message: submitted.error.message,
          observedAt: new Date().toISOString(),
          recoverable: true,
          recommendedNextAction: "Refresh readiness and prepare a new upload transaction with fresh time bounds",
        },
      });
      setError(submitted.error.message);
      setStage("failed");
      return;
    }
    if (!submitted.ok || submitted.submission.status !== "SUCCESS") { setError(submitted.ok ? submitted.submission.detail ?? "Transaction was not confirmed." : submitted.error.message); setStage("failed"); return; }
    if (nextStage === "upload") { setUploadHash(submitted.submission.transactionHash); setSignedUpload(null); setPendingHash(null); setPendingRequiresInspection(false); setHasInspectedSincePending(false); if (!advanceSession(["UPLOAD_SUBMITTED", "UPLOAD_CONFIRMED"], { transactionHash: submitted.submission.transactionHash })) { setStage("failed"); return; } setStage("confirmed"); }
    else { const value = submitted.submission.returnValue?.value; const confirmedContractId = value && /^C[2-7A-Z]{55}$/.test(value) ? value : null; setCreateHash(submitted.submission.transactionHash); setContractId(confirmedContractId); setSignedCreate(null); setPendingHash(null); setPendingRequiresInspection(false); setHasInspectedSincePending(false); if (!confirmedContractId || !advanceSession(["CREATE_SUBMITTED", "CREATE_CONFIRMED"], { transactionHash: submitted.submission.transactionHash, contractId: confirmedContractId })) { setError("Confirmed creation did not provide a valid contract ID."); setStage("failed"); return; } setStage("confirmed"); }
    setConfirmed(false);
  }

  async function verifyContract() {
    if (!contractId || !sessionReconciled || deploymentSession.state !== "CREATE_CONFIRMED") return;
    const pendingSession = advanceSession(["INDEPENDENT_VERIFICATION_PENDING"], { contractId });
    if (!pendingSession) return;
    const response = await fetch("/api/transactions/deploy/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractId }) });
    const result = await response.json() as { deployedHash?: string; artifactHash?: string | null; verified?: boolean; error?: string };
    if (!response.ok || !result.deployedHash) { setError(result.error ?? "The deployed contract could not be independently verified."); return; }
    if (!result.verified || result.deployedHash !== artifactHash || result.artifactHash !== artifactHash) { setError("Independent verification failed: deployed WASM hash does not exactly match authoritative artifact evidence."); return; }
    const verifiedSession = advanceSession(["INDEPENDENTLY_VERIFIED"], { contractId, artifactHash: result.deployedHash }, pendingSession);
    if (!verifiedSession) return;
    setDeployedHash(result.deployedHash);
  }

  async function inspectAccount() {
    if (!isValidPublicKey(deploymentAccount)) { setError("Only a valid public G... deployment account may be inspected (StrKey). Arbitrary text, S... secrets, and whitespace are rejected."); return; }
    setError(null);
    try {
      const response = await fetch("/api/testnet/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: deploymentAccount, minimumNativeBalance: "1" }), cache: "no-store" });
      const payload = await response.json() as { result?: { status: string; exists: boolean | null; sufficientBalance: boolean | null; sequenceNumber: string | null; nativeBalance: string | null }; error?: string };
      if (!response.ok || !payload.result) { setError(payload.error ?? "Public account inspection failed."); return; }
      setAccountInspection(payload.result);
    } catch (inspectionError) { setError(inspectionError instanceof Error ? inspectionError.message : "Public account inspection failed."); }
  }

  async function recordEvidence() {
    if (!canRecordDeploymentEvidence({ status: "CONFIRMED", userConfirmed: false, simulationPassed: false, signedTransactionAvailable: false, uploadConfirmed: Boolean(uploadHash), creationConfirmed: Boolean(createHash), contractId, artifactVerified: Boolean(deployedHash && deployedHash === artifactHash) }) || !deployer) return;
    const response = await fetch("/api/transactions/deploy/record", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ componentId: ACCESS_CONTROL_WORKFLOW.componentId, network: "testnet", contractId, uploadTransactionHash: uploadHash, deploymentTransactionHash: createHash, deployer, constructorArguments: { admin } }) });
    if (response.ok && advanceSession(["EVIDENCE_RECORDED"], { contractId, artifactHash: deployedHash })) setRecorded(true);
  }

  const simulationStatus = stage === "prepared" ? "PREPARED" : stage === "simulated" ? "SIMULATED" : stage === "awaiting-confirmation" ? "AWAITING_USER_CONFIRMATION" : stage.toUpperCase();
  const uploadReady = Boolean(upload && upload.simulation.status === "SUCCESS");
  const canPrepareCreateStage = deploymentSession.state === "UPLOAD_CONFIRMED" && uploadReady && Boolean(uploadHash) && !createHash;
  // Preflight synthesis for UI (reuses existing guards, no fabrication) — authoritative StrKey validation
  const adminTrimmed = admin.trim();
  const deployerValid = isValidPublicKey(deploymentAccount);
  const adminSupplied = Boolean(adminTrimmed);
  const adminValid = isValidPublicKey(admin);
  const deploymentAccountDisplay = !deployer ? "NOT SUPPLIED • ACCOUNT_NOT_SUPPLIED" : deployerValid ? deployer : "INVALID_STELLAR_ADDRESS";
  const adminDisplay = !adminTrimmed ? "NOT SUPPLIED" : adminValid ? adminTrimmed : "INVALID_STELLAR_ADDRESS";
  const artifactVerified = artifactEvidenceVerified && Boolean(artifactHash);
  const deploymentAccountSupplied = Boolean(deployer);
  const walletConnected = wallet.state.status === "connected";
  const walletOnTestnet = wallet.state.networkPassphrase === testnetPassphrase;
  const preflightStatus = readiness?.finalReadiness ?? "NOT_REFRESHED";
  const environmentReady = walletConnected && walletOnTestnet && connectivityHealthy;
  return <div className="mt-10 space-y-8">
    <div className="rounded-default border border-tone-onchain/40 bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-stellar">Controlled deployment · Access Control only</p>
      <h2 className="mt-3 font-display text-2xl font-medium text-text-primary sm:text-3xl">Testnet Deployment</h2>
      <p className="mt-2 text-base leading-7 text-text-secondary">Testnet only • {testnetEndpoint} • Access Control is the ONLY eligible component • No deployment occurs without explicit user confirmation • Simulations are read-only and do not imply deployment</p>
        </div>
        <div className="flex flex-wrap gap-2"><span className="rounded-default border border-tone-onchain/50 px-2 py-0.5 font-mono text-[11px] text-tone-onchain">TESTNET</span><span className="rounded-default border border-border px-2 py-0.5 font-mono text-[11px] text-tone-pending">WALLET REQUIRED</span></div>
      </div>
    </div>

<div className="grid gap-5 rounded-default border border-border bg-surface p-5 font-mono text-sm sm:p-6">
      <div className="space-y-3">
        <span className="text-text-secondary font-mono text-[11px] uppercase">Environment</span>
        <div className="grid grid-cols-[10rem_1fr] gap-2">
          <span className="text-text-secondary">Network</span>
          <span className={environmentReady ? "text-tone-success" : "text-tone-error"}>{environmentReady ? "READY • Testnet confirmed • PASS" : "BLOCKED • Testnet not confirmed"}</span>
        </div>
        <div className="grid grid-cols-[10rem_1fr] gap-2">
          <span className="text-text-secondary">Endpoint</span>
          <span className="break-all">{testnetEndpoint}</span>
        </div>
        <div className="grid grid-cols-[10rem_1fr] gap-2">
          <span className="text-text-secondary">Wallet</span>
          <span>{walletConnected ? `${wallet.state.address?.slice(0, 8)}… (${wallet.state.networkName ?? "unknown"})` : "NOT CONNECTED"}</span>
        </div>
      </div>

      <div className="space-y-3 border-t border-border/40 pt-4">
        <span className="text-text-secondary font-mono text-[11px] uppercase">Artifact</span>
        <div className="grid grid-cols-[10rem_1fr] gap-2">
          <span className="text-text-secondary">Path</span>
          <span className="break-all">{artifactPath}</span>
        </div>
        <div className="grid grid-cols-[10rem_1fr] gap-2">
          <span className="text-text-secondary">SHA-256</span>
          <span className="break-all">{artifactHash ?? "unavailable"}</span>
        </div>
        <div className="grid grid-cols-[10rem_1fr] gap-2">
          <span className="text-text-secondary">Status</span>
          <span className={artifactVerified ? "text-tone-success" : "text-tone-error"}>{artifactVerified ? "READY • VERIFIED_MATCH" : "BLOCKED • artifact unavailable"}</span>
        </div>
      </div>

      <div className="space-y-3 border-t border-border/40 pt-4">
        <span className="text-text-secondary font-mono text-[11px] uppercase">Deployment account</span>
        <div className="grid grid-cols-[10rem_1fr] gap-2">
          <span className="text-text-secondary">Address</span>
          <span className="break-all">{deploymentAccountDisplay}</span>
        </div>
        <div className="grid grid-cols-[10rem_1fr] gap-2">
          <span className="text-text-secondary">Status</span>
          <span className={!deploymentAccountSupplied ? "text-tone-error" : !deployerValid ? "text-tone-error" : walletConnected ? "text-tone-pending" : "text-tone-error"}>{!deploymentAccountSupplied ? "BLOCKED • ACCOUNT_NOT_SUPPLIED" : !deployerValid ? "BLOCKED • INVALID_ACCOUNT (StrKey)" : walletConnected ? "READY • public G... supplied (balance check server-side)" : "BLOCKED"}</span>
        </div>
        <p className="text-[11px] text-text-secondary">Only public G... accepted; S.../seed/secret rejected. Sequence & native XLM balance inspected read-only.</p>
      </div>

      <div className="space-y-3 border-t border-border/40 pt-4">
        <span className="text-text-secondary font-mono text-[11px] uppercase">Constructor admin</span>
        <div className="grid grid-cols-[10rem_1fr] gap-2">
          <span className="text-text-secondary">Address</span>
          <span className="break-all">{adminDisplay}</span>
        </div>
        <div className="grid grid-cols-[10rem_1fr] gap-2">
          <span className="text-text-secondary">Valid</span>
          <span className={!adminSupplied ? "text-tone-error" : adminValid ? "text-tone-success" : "text-tone-error"}>{!adminSupplied ? "BLOCKED • admin not supplied" : adminValid ? "READY • valid G..." : "BLOCKED • INVALID_ACCOUNT"}</span>
        </div>
        <p className="text-[11px] text-text-secondary">Deployment account and constructor admin are separate concepts, even if same G... is chosen for both. Never inferred or hardcoded.</p>
      </div>

      <div className="space-y-3 border-t border-border/40 pt-4">
        <span className="text-text-secondary font-mono text-[11px] uppercase">Preflight (authoritative API)</span>
        <div className="grid grid-cols-[10rem_1fr] gap-2">
          <span className="text-text-secondary">Status</span>
          <span className={preflightStatus === "READY_FOR_CONTROLLED_TESTNET_DEPLOYMENT" ? "text-tone-success" : "text-tone-error"}>{preflightStatus}</span>
        </div>
        <div className="grid grid-cols-[10rem_1fr] gap-2">
          <span className="text-text-secondary">Gates</span>
          <span className="break-all">{readiness?.gates ? Object.entries(readiness.gates).map(([k, v]) => `${k}:${v.status}`).join(" • ") : "NOT_REFRESHED"}</span>
        </div>
        {readiness?.blockingReason && <p className="text-[11px] text-tone-error">Blocker: {readiness.blockingReason}</p>}
        <Button variant="secondary" className="mt-3" onClick={() => void refreshAuthoritativeState()}>Refresh readiness and reconciliation</Button>
      </div>
    </div>

    {(() => {
      // Authoritative reconciliation — single source of truth, deterministic, idempotent
      const derivedState = deploymentSession.state;
      const mockSession = deploymentSession;
      const recovery = getDeploymentSessionRecoveryState({ ...mockSession, state: derivedState } as unknown as import("@/lib/verification/deployment-session").DeploymentSession);
      const nextAction = getNextAllowedOperatorAction({ ...mockSession, state: derivedState } as unknown as import("@/lib/verification/deployment-session").DeploymentSession);
      const allowed = getAllowedDeploymentTransitions(derivedState);
      return (
        <div className="rounded-default border border-border bg-surface p-5 font-mono text-sm sm:p-6">
          <p className="flex items-baseline gap-3"><span className="text-text-secondary font-mono text-[11px] uppercase">Deployment Session (authoritative)</span> <span className={derivedState === "PREFLIGHT_READY" ? "text-tone-success" : derivedState.includes("BLOCKED") ? "text-tone-error" : "text-text-secondary"}>{derivedState}</span></p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-[10rem_1fr] gap-2"><span className="text-text-secondary">Current state</span><span>{derivedState}</span></div>
            <div className="grid grid-cols-[10rem_1fr] gap-2"><span className="text-text-secondary">Previous state</span><span>{mockSession.previousState ?? "none"}</span></div>
            <div className="grid grid-cols-[10rem_1fr] gap-2"><span className="text-text-secondary">Blocking reason</span><span className="break-all">{mockSession.blockingReason ?? (derivedState.includes("BLOCKED") ? derivedState : "none")}</span></div>
            <div className="grid grid-cols-[10rem_1fr] gap-2"><span className="text-text-secondary">Next allowed</span><span className="break-all">{allowed.join(", ") || "none"}</span></div>
            <div className="grid grid-cols-[10rem_1fr] gap-2"><span className="text-text-secondary">Forbidden</span><span className="break-all">{recovery.forbidden.join(", ") || "none — no auto sign/submit"}</span></div>
            <div className="grid grid-cols-[10rem_1fr] gap-2"><span className="text-text-secondary">Last observed</span><span>{hasMounted ? lastObservedDisplay : "—"}</span></div>
            <div className="grid grid-cols-[10rem_1fr] gap-2"><span className="text-text-secondary">Recommended</span><span>{nextAction}</span></div>
          </div>
          <div className="mt-5 space-y-3">
            <p className="text-[11px] leading-relaxed">Lifecycle: Preflight → Upload prepared → Upload simulated → Upload confirmed → Create prepared → Create simulated → Create confirmed → Independent verification → Evidence recorded</p>
            <p className="text-[11px] leading-relaxed">Clearly: SIMULATED ≠ SIGNED ≠ SUBMITTED ≠ CONFIRMED ≠ DEPLOYED ≠ VERIFIED</p>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
            <Button variant="secondary" onClick={() => void refreshAuthoritativeState()}>Refresh readiness/reconciliation (read-only)</Button>
            <span className="text-sm text-text-secondary">Refresh does not sign, submit, or advance — explicit Continue required</span>
          </div>
          <div className="mt-6 rounded-default border border-border/60 bg-canvas p-4">
            <p className="text-[11px] uppercase">Session Recovery (read-only)</p>
            <div className="mt-3 grid gap-2">
              <div className="grid grid-cols-[12rem_1fr] gap-2"><span className="text-text-secondary">Historical lifecycle</span><span>{deploymentSession.state}</span></div>
              <div className="grid grid-cols-[12rem_1fr] gap-2"><span className="text-text-secondary">Current readiness</span><span>{derivedState}</span></div>
              <div className="grid grid-cols-[12rem_1fr] gap-2"><span className="text-text-secondary">Restoration status</span><span>{restorationStatus ?? "NOT_RESTORED"}</span></div>
              <div className="grid grid-cols-[12rem_1fr] gap-2"><span className="text-text-secondary">Tx confirmation</span><span>{uploadHash ? "CONFIRMED" : upload ? "UNKNOWN" : "NOT_SUBMITTED"}</span></div>
              <div className="grid grid-cols-[12rem_1fr] gap-2"><span className="text-text-secondary">Verification</span><span>{deployedHash ? "VERIFIED" : contractId ? "PENDING" : "NOT_STARTED"}</span></div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="ghost" onClick={() => { const raw = localStorage.getItem("stellar-forge:deployment-session:v29"); if (!raw) { setError("No persisted session to restore."); return; } const r = restoreDeploymentSession(raw); if (r.status === "RESTORED" && r.session) { setDeploymentSession(r.session); setSessionReconciled(false); setRestorationStatus("RESTORED"); } else { setError(r.error ?? "Restore failed."); } }}>Restore session (reconciliation required)</Button>
              <Button variant="ghost" onClick={() => void refreshAuthoritativeState()}>Reconcile prerequisites (read-only)</Button>
              <Button variant="ghost" onClick={async () => { const hashToInspect = uploadHash ?? pendingHash; if (!hashToInspect) { setError("No upload transaction to inspect."); return; } const res = await fetch(`/api/testnet/transaction/inspect?hash=${hashToInspect}`); const j = await res.json(); setError(`Tx inspect: ${j.status ?? j.error}`); if (pendingRequiresInspection) setHasInspectedSincePending(true); }}>Refresh transaction confirmation</Button>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={async () => { if (!contractId) { setError("No contract ID to inspect."); return; } const res = await fetch(`/api/testnet/contract/inspect?contractId=${contractId}`); const j = await res.json(); setError(`Contract inspect: ${j.status ?? j.error}`); }}>Inspect contract</Button>
              <Button variant="ghost" onClick={() => { clearDeploymentSession(); setRestorationStatus(null); setError("Cleared local session persistence. No blockchain state reversed."); }}>Clear recovered session</Button>
            </div>
            <p className="mt-5 text-[11px] text-text-secondary">Read-only recovery: never signs, submits, or creates. Clearing only removes local persistence.</p>
          </div>
        </div>
      );
    })()}

    <div className="rounded-default border border-border/40 bg-surface p-5 font-mono text-sm sm:p-6">
      <p className="flex items-baseline gap-3"><span className="text-text-secondary font-mono text-[11px] uppercase">Stage A — WASM Upload</span> <span className={upload ? (upload.simulation.status === "SUCCESS" ? "text-tone-success" : "text-tone-error") : "text-text-secondary"}>{upload ? (upload.simulation.status === "SUCCESS" ? "SIMULATED" : "FAILED") : "BLOCKED"}</span></p>
      <p className="mt-3 text-text-secondary leading-relaxed">States: BLOCKED → READY → PREPARED → SIMULATED → AWAITING_USER_CONFIRMATION → SIGNED → SUBMITTED → CONFIRMED. Signing and submission are separate explicit actions. {upload ? `Simulation: ${upload.simulation.status}. ${upload.simulation.status === "SUCCESS" ? "Simulation succeeded. No transaction has been signed. No transaction has been submitted. No contract has been deployed." : "SIMULATION_UNAVAILABLE"}` : "Awaiting upload simulation."}</p>
      <p className="mt-3 text-text-secondary">Evidence: {upload ? "PREPARED→SIMULATED" : "NO_EVIDENCE"}</p>
    </div>
    <div className="rounded-default border border-border/40 bg-surface p-5 font-mono text-sm sm:p-6">
      <p className="flex items-baseline gap-3"><span className="text-text-secondary font-mono text-[11px] uppercase">Stage B — Contract Creation</span> <span className={create ? (create.simulation.status === "SUCCESS" ? "text-tone-success" : "text-tone-error") : canPrepareCreateStage ? "text-tone-pending" : "text-text-secondary"}>{create ? (create.simulation.status === "SUCCESS" ? "SIMULATED" : "FAILED") : canPrepareCreateStage ? "READY • upload SIMULATED" : "BLOCKED • upload simulation required"}</span></p>
      <p className="mt-3 text-text-secondary leading-relaxed">States: BLOCKED → PREPARED → SIMULATED → AWAITING_USER_CONFIRMATION → SIGNED → SUBMITTED → CONFIRMED. Creation is blocked until Stage A is confirmed. {create ? `Simulation: ${create.simulation.status}. ${create.simulation.status === "SUCCESS" ? "Simulation succeeded. No transaction has been signed. No transaction has been submitted. No contract has been deployed." : "SIMULATION_UNAVAILABLE"}` : "Awaiting Stage A confirmation."}</p>
      <p className="mt-3 text-text-secondary">Evidence: {create ? "PREPARED→SIMULATED" : "NO_EVIDENCE"}</p>
    </div>

    <div className="rounded-default border border-border/40 bg-surface p-5 font-mono text-sm sm:p-6">
      <p className="flex items-baseline gap-3">Simulation boundary: <span className={stage === "prepared" ? "text-tone-pending" : stage === "simulated" ? "text-tone-success" : stage === "awaiting-confirmation" ? "text-accent-stellar" : "text-text-secondary"}>{simulationStatus}</span> — {stage === "awaiting-confirmation" ? "AWAITING_USER_CONFIRMATION: signing has not occurred" : stage === "simulated" ? "SIMULATED: ready for user confirmation" : stage === "prepared" ? "PREPARED: transaction built" : "IDLE"}</p>
      <p className="mt-3 text-text-secondary leading-relaxed">Upload: {upload ? `${upload.simulation.status} (${upload.simulation.status === "SUCCESS" ? "SIMULATED" : "FAILED"})` : "NOT_STARTED"} • Create: {create ? `${create.simulation.status}` : "NOT_STARTED"} • Signing has not occurred until you confirm. Submission requires explicit confirmation + valid signed transaction. No autoSign/autoSubmit.</p>
    </div>
    <label className="mt-8 block font-mono text-sm text-text-secondary">Deployment account address<input value={deploymentAccount} onChange={(event) => { setDeploymentAccount(event.target.value); setAccountInspection(null); }} placeholder="G... (enter explicitly)" className="mt-3 block min-h-11 w-full rounded-default border border-border bg-canvas px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-secondary/60" />{deploymentAccount && !deployerValid ? <span className="mt-2 block font-mono text-[11px] text-tone-error">Invalid Stellar public key — must be valid G... StrKey (56 chars), S... secrets and arbitrary text rejected</span> : null}</label>
    <div className="mt-5 flex flex-wrap gap-3"><Button variant="secondary" onClick={() => void wallet.connect()} disabled={wallet.state.status === "connecting" || wallet.state.status === "connected"}>Connect wallet explicitly</Button><Button variant="secondary" onClick={() => void inspectAccount()} disabled={!isValidPublicKey(deploymentAccount) || accountInspection !== null}>Inspect public account</Button></div>
    {accountInspection && <p className="mt-3 font-mono text-sm text-text-secondary">Account: {accountInspection.status} · sequence {accountInspection.sequenceNumber ?? "unknown"} · XLM {accountInspection.nativeBalance ?? "unknown"}</p>}
    <label className="mt-8 block font-mono text-sm text-text-secondary">Constructor admin address<input value={admin} onChange={(event) => setAdmin(event.target.value)} placeholder="G... (enter intentionally, S... rejected)" className="mt-3 block min-h-11 w-full rounded-default border border-border bg-canvas px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-secondary/60" />{admin && !adminValid ? <span className="mt-2 block font-mono text-[11px] text-tone-error">Invalid Stellar public key — must be valid G... StrKey (56 chars), S... secrets and arbitrary text rejected</span> : null}</label>
    {stage === "awaiting-confirmation" && <label className="mt-5 flex gap-2 text-sm text-text-primary"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />You are about to deploy a smart contract to Stellar Testnet. This creates permanent Testnet state, consumes network resources, is not Mainnet, and requires my wallet confirmation. No background execution.</label>}
    <div className="mt-6 flex flex-wrap gap-3"><Button variant="primary" onClick={() => void prepare("upload")} disabled={deploymentSession.state !== "PREFLIGHT_READY" || !sessionReconciled || stage === "preparing" || stage === "signing" || stage === "submitting" || !deployerValid || !adminValid}>Prepare and simulate upload</Button>{canPrepareCreateStage && <Button variant="primary" onClick={() => void prepare("create")} disabled={stage === "preparing" || stage === "signing" || stage === "submitting"}>Prepare and simulate create</Button>}{deploymentSession.state === "AWAITING_UPLOAD_CONFIRMATION" && upload && !uploadHash ? <Button variant="primary" onClick={() => void signStage(upload, "upload")} disabled={!confirmed}>Confirm and sign upload</Button> : deploymentSession.state === "AWAITING_CREATE_CONFIRMATION" && create ? <Button variant="primary" onClick={() => void signStage(create, "create")} disabled={!confirmed}>Confirm and sign create</Button> : null}{deploymentSession.state === "UPLOAD_SIGNED" && signedUpload && <Button variant="primary" onClick={() => void submitStage("upload")} disabled={!confirmed || (pendingRequiresInspection && !hasInspectedSincePending)}>Explicitly submit signed upload</Button>}{deploymentSession.state === "CREATE_SIGNED" && signedCreate && <Button variant="primary" onClick={() => void submitStage("create")} disabled={!confirmed || (pendingRequiresInspection && !hasInspectedSincePending)}>Explicitly submit signed create</Button>}{deploymentSession.state === "CREATE_CONFIRMED" && contractId && <Button variant="secondary" onClick={() => void verifyContract()}>Verify deployed WASM</Button>}</div>
    {pendingRequiresInspection && !hasInspectedSincePending && pendingHash && <p className="font-mono text-[11px] text-tone-pending">PENDING inspection required before resubmission. Hash: {pendingHash}. Use “Refresh transaction confirmation” to inspect.</p>}
    {pendingHash && <p className="font-mono text-[11px] text-text-secondary">Pending hash: {pendingHash} {hasInspectedSincePending ? "· inspected ✓" : "· not yet inspected"}</p>}
    <div className="rounded-default border border-border/60 bg-canvas p-4 font-mono text-sm">
      <p><span className="text-text-secondary font-mono text-[11px] uppercase">User Confirmation</span> <span className={confirmed ? "text-tone-success" : "text-text-secondary"}>{confirmed ? "CONFIRMED • explicit user confirmation present" : "AWAITING_USER_CONFIRMATION • explicit confirmation required before signing"}</span></p>
      <p className="mt-2 text-text-secondary">Evidence progression: NO_EVIDENCE → PREPARED → SIMULATED → AWAITING_USER_CONFIRMATION → SIGNED → SUBMITTED → CONFIRMED → INDEPENDENTLY_VERIFIED → RECORDED. Invalid shortcuts (PREPARED→RECORDED, SIMULATED→VERIFIED, etc.) rejected.</p>
      <p className="mt-2 text-text-secondary">Evidence: {recorded ? "RECORDED" : deployedHash ? "INDEPENDENTLY_VERIFIED" : contractId ? "CONFIRMED" : createHash || uploadHash ? "SUBMITTED" : stage === "awaiting-confirmation" ? "AWAITING_USER_CONFIRMATION" : stage === "simulated" ? "SIMULATED" : stage === "prepared" ? "PREPARED" : "NO_EVIDENCE"} {recorded ? "" : "(no deployment claimed)"}</p>
    </div>
    <div className="mt-4 flex flex-wrap gap-3">
      {uploadHash && <p className="font-mono text-sm text-text-secondary">Upload confirmed: {uploadHash}</p>}
      {contractId && <p className="font-mono text-sm text-text-secondary">Contract ID: {contractId}</p>}
      {deployedHash && <p className="font-mono text-sm text-tone-success">Deployed SHA-256: {deployedHash} · {deployedHash === artifactHash ? "VERIFIED" : "MISMATCH"}</p>}
      {deployedHash === artifactHash && contractId && <Button variant="ghost" onClick={() => void recordEvidence()} disabled={recorded}>{recorded ? "Evidence recorded" : "Record verified evidence"}</Button>}
      {error && <p className="text-sm text-tone-error">{error}</p>}
    </div>
    <p className="mt-4 font-mono text-[11px] text-text-secondary">No contract was deployed by preparing or simulating. Deployment requires explicit signing and submission. No background execution, no auto-retry, no bulk deployments. Only Access Control eligible.</p>
  </div>;
}
