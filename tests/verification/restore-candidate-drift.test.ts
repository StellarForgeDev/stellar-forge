import { describe, expect, it, vi, beforeEach } from "vitest";
import { createDeploymentSession, reconcileDeploymentSession, serializeDeploymentSession } from "@/lib/verification/deployment-session";

const { verifyCandidateArtifact } = vi.hoisted(() => ({ verifyCandidateArtifact: vi.fn() }));

vi.mock("@/lib/verification/artifact-provenance", () => ({ verifyCandidateArtifact }));
vi.mock("@/lib/verification/testnet-connectivity", () => ({
  diagnoseTestnetConnectivity: async () => ({ status: "NETWORK_OK", failureCategory: undefined }),
}));

import { POST } from "@/app/api/testnet/deployment-session/restore/route";

const ACCOUNT = "GBQGCPTQVAB3DDO32QEQDEN6X6EENPMLOMMTA2KE4ZNPHFCYJU7PGWKW";
const HASH = "39b4c6d022146e4316642cf94bfc759fa85ae7399539798021e0136c768dfc3e";

function readySerializedSession() {
  const initial = createDeploymentSession({ artifactHash: HASH, deploymentAccount: ACCOUNT, constructorAdmin: ACCOUNT });
  const reconciled = reconcileDeploymentSession(initial, {
    connectivity: { status: "NETWORK_OK" },
    artifact: { verified: true, status: "CANDIDATE_VERIFIED" },
    account: { status: "ACCOUNT_READY", exists: true, sufficientBalance: true },
    constructorAdmin: { supplied: true, valid: true },
  });
  return serializeDeploymentSession(reconciled);
}

describe("restore candidate drift", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    { status: "CANDIDATE_MISMATCH", error: "candidate changed" },
    { status: "CANDIDATE_MANIFEST_UNAVAILABLE", error: "candidate unavailable" },
    { status: "ARTIFACT_UNAVAILABLE", error: "artifact changed" },
  ])("does not restore readiness when current candidate is $status", async (verification) => {
    verifyCandidateArtifact.mockResolvedValue(verification);
    const response = await POST(new Request("http://localhost/api/testnet/deployment-session/restore", {
      method: "POST",
      body: JSON.stringify({ serialized: readySerializedSession(), account: ACCOUNT, admin: ACCOUNT }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.artifact.verified).toBe(false);
    expect(body.artifact.status).toBe(verification.status);
    expect(body.session.state).not.toBe("PREFLIGHT_READY");
  });

});
