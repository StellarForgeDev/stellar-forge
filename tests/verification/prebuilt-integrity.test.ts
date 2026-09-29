import { describe, it, expect } from "vitest";
import { verifyArtifactIntegrity } from "../../scripts/verify-prebuilt.mjs";

describe("Artifact Integrity Gate", () => {
  const validMetadata = {
    version: "0.1.0",
    gitCommit: "349380efc6d237dcda2c328c64ddb00471004d06",
    sdkVersion: "27",
    target: "wasm32v1-none",
    toolchain: "1.97.1",
    contracts: {
      "access-control": {
        package: "access-control",
        crate: "access_control",
        file: "access-control.wasm",
        sha256: "d5a89fb356afbbd0c9f16c68a649fb980f7cbca04b08dc2d53bf3d77d704d9a6"
      }
    }
  };
  const validChecksumsRaw = "d5a89fb356afbbd0c9f16c68a649fb980f7cbca04b08dc2d53bf3d77d704d9a6 access-control.wasm\n";
  const validWasmFilesOnDisk = [
    { file: "access-control.wasm", hash: "d5a89fb356afbbd0c9f16c68a649fb980f7cbca04b08dc2d53bf3d77d704d9a6" }
  ];

  it("passes for a valid complete artifact set", () => {
    const result = verifyArtifactIntegrity({
      metadata: validMetadata,
      checksumsRaw: validChecksumsRaw,
      wasmFilesOnDisk: validWasmFilesOnDisk
    });
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects an unexpected extra .wasm file", () => {
    const result = verifyArtifactIntegrity({
      metadata: validMetadata,
      checksumsRaw: validChecksumsRaw,
      wasmFilesOnDisk: [
        ...validWasmFilesOnDisk,
        { file: "malicious.wasm", hash: "1234567890123456789012345678901234567890123456789012345678901234" }
      ]
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain("unexpected extra WASM file on disk: malicious.wasm");
  });

  it("rejects a missing expected .wasm file", () => {
    const result = verifyArtifactIntegrity({
      metadata: validMetadata,
      checksumsRaw: validChecksumsRaw,
      wasmFilesOnDisk: []
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain("missing WASM for access-control: access-control.wasm");
  });

  it("rejects an unexpected checksum entry", () => {
    const result = verifyArtifactIntegrity({
      metadata: validMetadata,
      checksumsRaw: validChecksumsRaw + "1234567890123456789012345678901234567890123456789012345678901234 extra.wasm\n",
      wasmFilesOnDisk: validWasmFilesOnDisk
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain("checksums.txt has extra entry not in metadata: extra.wasm");
  });

  it("rejects a missing checksum entry", () => {
    const result = verifyArtifactIntegrity({
      metadata: validMetadata,
      checksumsRaw: "",
      wasmFilesOnDisk: validWasmFilesOnDisk
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain("metadata and checksums artifact count mismatch: 1 vs 0");
    expect(result.errors).toContain("checksums.txt missing entry for access-control.wasm");
  });

  it("rejects metadata/checksum hash disagreement", () => {
    const badChecksumsRaw = "1234567890123456789012345678901234567890123456789012345678901234 access-control.wasm\n";
    const result = verifyArtifactIntegrity({
      metadata: validMetadata,
      checksumsRaw: badChecksumsRaw,
      wasmFilesOnDisk: validWasmFilesOnDisk
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain("metadata vs checksums mismatch for access-control.wasm: d5a89fb356afbbd0c9f16c68a649fb980f7cbca04b08dc2d53bf3d77d704d9a6 vs 1234567890123456789012345678901234567890123456789012345678901234");
  });

  it("rejects metadata pointing at an unexpected artifact file name", () => {
    const badMetadata = JSON.parse(JSON.stringify(validMetadata));
    badMetadata.contracts["access-control"].file = "wrong-name.wasm";
    
    const result = verifyArtifactIntegrity({
      metadata: badMetadata,
      checksumsRaw: validChecksumsRaw,
      wasmFilesOnDisk: validWasmFilesOnDisk
    });
    expect(result.success).toBe(false);
    expect(result.errors).toContain("metadata access-control file mismatch: expected access-control.wasm, got wrong-name.wasm");
  });


});
