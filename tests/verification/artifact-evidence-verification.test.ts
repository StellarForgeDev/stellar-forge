import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { verifyArtifactEvidence } from "@/lib/verification/artifact-evidence-verification";
import * as fsPromises from "node:fs/promises";
import { createHash } from "node:crypto";

vi.mock("node:fs/promises");

describe("verifyArtifactEvidence", () => {
  const dummyWasm = Buffer.from([0, 1, 2, 3]);
  const dummyHash = createHash("sha256").update(dummyWasm).digest("hex");

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns VERIFIED_MATCH when actual wasm hash equals evidence hash", async () => {
    vi.spyOn(fsPromises, "readFile").mockImplementation(async (path: unknown) => {
      if (typeof path === "string" && path.endsWith(".wasm")) return dummyWasm;
      if (typeof path === "string" && path.endsWith("testnet-evidence.json")) {
        return JSON.stringify({
          evidence: [{
            componentId: "access-control",
            status: ["VERIFIED_MATCH"],
            sourceArtifact: { sha256: dummyHash }
          }]
        });
      }
      throw new Error("File not found");
    });

    const result = await verifyArtifactEvidence("access-control");
    expect(result.status).toBe("VERIFIED_MATCH");
    if (result.status === "VERIFIED_MATCH") {
      expect(result.wasmHash).toBe(dummyHash);
      expect(result.evidenceHash).toBe(dummyHash);
    }
  });

  it("returns LOCAL_ARTIFACT_MISMATCH when actual wasm hash differs from evidence hash", async () => {
    vi.spyOn(fsPromises, "readFile").mockImplementation(async (path: unknown) => {
      if (typeof path === "string" && path.endsWith(".wasm")) return dummyWasm;
      if (typeof path === "string" && path.endsWith("testnet-evidence.json")) {
        return JSON.stringify({
          evidence: [{
            componentId: "access-control",
            status: ["VERIFIED_MATCH"],
            sourceArtifact: { sha256: "different-hash" }
          }]
        });
      }
      throw new Error("File not found");
    });

    const result = await verifyArtifactEvidence("access-control");
    expect(result.status).toBe("LOCAL_ARTIFACT_MISMATCH");
    if (result.status === "LOCAL_ARTIFACT_MISMATCH") {
      expect(result.wasmHash).toBe(dummyHash);
      expect(result.evidenceHash).toBe("different-hash");
    }
  });

  it("returns ARTIFACT_UNAVAILABLE when wasm file cannot be read", async () => {
    vi.spyOn(fsPromises, "readFile").mockImplementation(async (path: unknown) => {
      if (typeof path === "string" && path.endsWith(".wasm")) throw new Error("ENOENT");
      return "{}";
    });

    const result = await verifyArtifactEvidence("access-control");
    expect(result.status).toBe("ARTIFACT_UNAVAILABLE");
  });

  it("returns EVIDENCE_UNAVAILABLE when evidence file is missing", async () => {
    vi.spyOn(fsPromises, "readFile").mockImplementation(async (path: unknown) => {
      if (typeof path === "string" && path.endsWith(".wasm")) return dummyWasm;
      if (typeof path === "string" && path.endsWith("testnet-evidence.json")) throw new Error("ENOENT");
      return "{}";
    });

    const result = await verifyArtifactEvidence("access-control");
    expect(result.status).toBe("EVIDENCE_UNAVAILABLE");
  });

  it("returns EVIDENCE_UNAVAILABLE when component is not in evidence", async () => {
    vi.spyOn(fsPromises, "readFile").mockImplementation(async (path: unknown) => {
      if (typeof path === "string" && path.endsWith(".wasm")) return dummyWasm;
      if (typeof path === "string" && path.endsWith("testnet-evidence.json")) {
        return JSON.stringify({ evidence: [] });
      }
      return "{}";
    });

    const result = await verifyArtifactEvidence("access-control");
    expect(result.status).toBe("EVIDENCE_UNAVAILABLE");
  });

  it("returns EVIDENCE_UNAVAILABLE when evidence does not include VERIFIED_MATCH", async () => {
    vi.spyOn(fsPromises, "readFile").mockImplementation(async (path: unknown) => {
      if (typeof path === "string" && path.endsWith(".wasm")) return dummyWasm;
      if (typeof path === "string" && path.endsWith("testnet-evidence.json")) {
        return JSON.stringify({
          evidence: [{
            componentId: "access-control",
            status: ["DEPLOYMENT_MISMATCH"],
            sourceArtifact: { sha256: dummyHash }
          }]
        });
      }
      return "{}";
    });

    const result = await verifyArtifactEvidence("access-control");
    expect(result.status).toBe("EVIDENCE_UNAVAILABLE");
  });
});
