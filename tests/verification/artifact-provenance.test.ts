import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import * as fsPromises from "node:fs/promises";
import { getCanonicalArtifactIdentity, verifyCandidateArtifact, verifyHistoricalArtifact } from "@/lib/verification/artifact-provenance";

vi.mock("node:fs/promises");

const dummyWasm = Buffer.from([0, 1, 2, 3]);
const dummyHash = createHash("sha256").update(dummyWasm).digest("hex");
const candidate = {
  component: "access-control",
  artifactPath: "prebuilt/access-control.wasm",
  artifactHash: dummyHash,
  contractsCommit: "0aac7802ec43dd296211763936863d5e929c6118",
  buildMetadataCommit: "349380efc6d237dcda2c328c64ddb00471004d06",
  sdkVersion: "27",
  target: "wasm32v1-none",
  toolchain: "1.97.1",
  candidateStatus: "CANDIDATE",
};

function mockFiles(options: { wasm?: Buffer; manifest?: unknown; historical?: unknown } = {}) {
  vi.spyOn(fsPromises, "readFile").mockImplementation((async (filePath: unknown) => {
    const value = String(filePath);
    if (value.endsWith("access-control.wasm")) {
      if (!options.wasm) throw new Error("ENOENT");
      return options.wasm;
    }
    if (value.endsWith("deployment-candidates.json")) {
      if (!options.manifest) throw new Error("ENOENT");
      return JSON.stringify(options.manifest);
    }
    if (value.endsWith("testnet-evidence.json")) {
      if (!options.historical) throw new Error("ENOENT");
      return JSON.stringify(options.historical);
    }
    throw new Error("ENOENT");
  }) as never);
}

describe("versioned artifact provenance", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("hashes the actual canonical artifact bytes", async () => {
    mockFiles({ wasm: dummyWasm, manifest: { schemaVersion: "1.0.0", candidates: [candidate] } });
    await expect(getCanonicalArtifactIdentity("access-control")).resolves.toEqual({ component: "access-control", artifactPath: "prebuilt/access-control.wasm", sha256: dummyHash });
  });

  it("returns CANDIDATE_VERIFIED for an exact candidate match", async () => {
    mockFiles({ wasm: dummyWasm, manifest: { schemaVersion: "1.0.0", candidates: [candidate] } });
    const result = await verifyCandidateArtifact("access-control");
    expect(result.status).toBe("CANDIDATE_VERIFIED");
  });

  it("returns CANDIDATE_MISMATCH when actual bytes differ from the manifest", async () => {
    mockFiles({ wasm: Buffer.from([9, 8, 7]), manifest: { schemaVersion: "1.0.0", candidates: [candidate] } });
    const result = await verifyCandidateArtifact("access-control");
    expect(result.status).toBe("CANDIDATE_MISMATCH");
  });

  it("returns CANDIDATE_MANIFEST_UNAVAILABLE when the manifest is missing", async () => {
    mockFiles({ wasm: dummyWasm });
    const result = await verifyCandidateArtifact("access-control");
    expect(result.status).toBe("CANDIDATE_MANIFEST_UNAVAILABLE");
  });

  it("returns ARTIFACT_UNAVAILABLE when the canonical artifact is missing", async () => {
    mockFiles({ manifest: { schemaVersion: "1.0.0", candidates: [candidate] } });
    const result = await verifyCandidateArtifact("access-control");
    expect(result.status).toBe("ARTIFACT_UNAVAILABLE");
  });

  it("returns INVALID_CANDIDATE_METADATA for malformed candidate metadata", async () => {
    mockFiles({ wasm: dummyWasm, manifest: { schemaVersion: "1.0.0", candidates: [{ ...candidate, artifactHash: undefined }] } });
    const result = await verifyCandidateArtifact("access-control");
    expect(result.status).toBe("INVALID_CANDIDATE_METADATA");
  });

  it("returns INVALID_CANDIDATE_METADATA for a malformed manifest envelope", async () => {
    mockFiles({ wasm: dummyWasm, manifest: { schemaVersion: "1.0.0" } });
    const result = await verifyCandidateArtifact("access-control");
    expect(result.status).toBe("INVALID_CANDIDATE_METADATA");
  });

  it("rejects an unsupported manifest schema version", async () => {
    mockFiles({ wasm: dummyWasm, manifest: { schemaVersion: "2.0.0", candidates: [candidate] } });
    const result = await verifyCandidateArtifact("access-control");
    expect(result.status).toBe("INVALID_CANDIDATE_METADATA");
  });

  it("uses server-computed bytes rather than any caller-provided hash", async () => {
    mockFiles({ wasm: dummyWasm, manifest: { schemaVersion: "1.0.0", candidates: [{ ...candidate, artifactHash: dummyHash }] } });
    const result = await verifyCandidateArtifact("access-control");
    expect(result.status).toBe("CANDIDATE_VERIFIED");
    if (result.status === "CANDIDATE_VERIFIED") expect(result.actualHash).toBe(dummyHash);
  });

  it("keeps historical verification separate from candidate verification", async () => {
    mockFiles({
      wasm: dummyWasm,
      manifest: { schemaVersion: "1.0.0", candidates: [candidate] },
      historical: { evidence: [{ componentId: "access-control", status: ["VERIFIED_MATCH"], sourceArtifact: { sha256: "dbc9527173eb86ad1ba2d155a14910062f8c33a871fe59b871aaa83148f0abfd" } }] },
    });
    const candidateResult = await verifyCandidateArtifact("access-control");
    const historicalResult = await verifyHistoricalArtifact("access-control");
    expect(candidateResult.status).toBe("CANDIDATE_VERIFIED");
    expect(historicalResult.status).toBe("LOCAL_ARTIFACT_MISMATCH");
  });

  it("represents historical evidence and candidate authorization as distinct", async () => {
    mockFiles({
      wasm: dummyWasm,
      manifest: { schemaVersion: "1.0.0", candidates: [candidate] },
      historical: { evidence: [{ componentId: "access-control", status: ["VERIFIED_MATCH"], sourceArtifact: { sha256: "dbc9527173eb86ad1ba2d155a14910062f8c33a871fe59b871aaa83148f0abfd" } }] },
    });
    const candidateResult = await verifyCandidateArtifact("access-control");
    const historicalResult = await verifyHistoricalArtifact("access-control");
    expect(candidateResult.status).toBe("CANDIDATE_VERIFIED");
    expect(historicalResult.status).toBe("LOCAL_ARTIFACT_MISMATCH");
    if (historicalResult.status === "LOCAL_ARTIFACT_MISMATCH") {
      expect(historicalResult.evidenceHash).toBe("dbc9527173eb86ad1ba2d155a14910062f8c33a871fe59b871aaa83148f0abfd");
    }
  });
});
