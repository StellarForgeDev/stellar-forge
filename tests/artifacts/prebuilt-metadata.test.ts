import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";

const PREBUILT_DIR = path.join(process.cwd(), "contracts", "prebuilt");
const METADATA_PATH = path.join(PREBUILT_DIR, "metadata.json");
const CHECKSUMS_PATH = path.join(PREBUILT_DIR, "checksums.txt");

const EXPECTED_PACKAGES = [
  "access-control",
  "allowance",
  "atomic-swap",
  "claimable-balance",
  "crowdfund",
  "escrow",
  "merkle-airdrop",
  "multi-signature",
  "oracle",
  "payment",
  "staking",
  "subscription",
  "timelock",
  "token",
  "vesting",
].sort();

const EXCLUDED = ["sandbox-runner", "greeter", "test-asset"];

function computeSha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

describe("prebuilt artifact metadata", () => {
  it("metadata.json exists and has required top-level fields", () => {
    expect(existsSync(METADATA_PATH)).toBe(true);
    const metadata = JSON.parse(readFileSync(METADATA_PATH, "utf8"));
    for (const field of ["version", "gitCommit", "sdkVersion", "target", "toolchain", "contracts"]) {
      expect(metadata).toHaveProperty(field);
      expect(typeof metadata[field] === "string" || typeof metadata[field] === "object").toBe(true);
    }
    expect(metadata.sdkVersion).toBe("27");
    expect(metadata.target).toBe("wasm32v1-none");
    expect(metadata.toolchain).toBe("1.97.1");
    expect(typeof metadata.version).toBe("string");
    expect(/^[a-f0-9]{40}$/.test(metadata.gitCommit) || metadata.gitCommit === "unknown").toBe(true);
  });

  it("contains all 15 production contracts and excludes non-contracts", () => {
    const metadata = JSON.parse(readFileSync(METADATA_PATH, "utf8"));
    const slugs = Object.keys(metadata.contracts).sort();
    expect(slugs).toEqual(EXPECTED_PACKAGES);
    for (const excluded of EXCLUDED) {
      expect(slugs).not.toContain(excluded);
    }
    expect(slugs).toHaveLength(15);
  });

  it("package/crate/file mappings are correct and hashes match WASM bytes", () => {
    const metadata = JSON.parse(readFileSync(METADATA_PATH, "utf8"));
    for (const slug of EXPECTED_PACKAGES) {
      const entry = metadata.contracts[slug];
      expect(entry).toBeDefined();
      expect(entry.package).toBe(slug);
      expect(entry.crate).toBe(slug.replace(/-/g, "_"));
      expect(entry.file).toBe(`${slug}.wasm`);
      expect(/^[a-f0-9]{64}$/.test(entry.sha256)).toBe(true);
      const wasmPath = path.join(PREBUILT_DIR, entry.file);
      expect(existsSync(wasmPath)).toBe(true);
      const actual = computeSha256(wasmPath);
      expect(entry.sha256).toBe(actual);
    }
  });
});

describe("prebuilt checksums.txt", () => {
  it("has exactly 15 entries, deterministic ordering, valid format, and every checksum matches WASM", () => {
    expect(existsSync(CHECKSUMS_PATH)).toBe(true);
    const raw = readFileSync(CHECKSUMS_PATH, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(15);
    // Check ordering is lexical
    const files = lines.map((l) => l.split(/\s+/)[1]);
    const sorted = [...files].sort((a, b) => a.localeCompare(b));
    expect(files).toEqual(sorted);
    // Check format and hash match
    for (const line of lines) {
      const match = line.match(/^([a-f0-9]{64})\s+(\S+)$/);
      expect(match).not.toBeNull();
      const [, hash, file] = match!;
      expect(EXPECTED_PACKAGES.map((p) => `${p}.wasm`)).toContain(file);
      const wasmPath = path.join(PREBUILT_DIR, file);
      expect(existsSync(wasmPath)).toBe(true);
      expect(computeSha256(wasmPath)).toBe(hash);
    }
  });

  it("contains no entry for metadata.json or sandbox-runner", () => {
    const raw = readFileSync(CHECKSUMS_PATH, "utf8");
    expect(raw).not.toContain("metadata.json");
    expect(raw).not.toContain("sandbox-runner");
    expect(raw).not.toContain("greeter");
    expect(raw).not.toContain("test-asset");
  });
});

describe("checksum-only verification (future web verification without Cargo)", () => {
  function createTempArtifactDir(): string {
    const tmp = path.join(os.tmpdir(), `stellar-forge-prebuilt-verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(tmp, { recursive: true });
    // Copy WASM files
    for (const slug of EXPECTED_PACKAGES) {
      const src = path.join(PREBUILT_DIR, `${slug}.wasm`);
      const dest = path.join(tmp, `${slug}.wasm`);
      copyFileSync(src, dest);
    }
    // Copy metadata and checksums
    copyFileSync(METADATA_PATH, path.join(tmp, "metadata.json"));
    copyFileSync(CHECKSUMS_PATH, path.join(tmp, "checksums.txt"));
    return tmp;
  }

  it("succeeds with a valid artifact directory", async () => {
    const tmp = createTempArtifactDir();
    try {
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync("node", ["scripts/verify-prebuilt.mjs", "--from-package", tmp], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("all checksums verified OK");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails when a WASM is modified", async () => {
    const tmp = createTempArtifactDir();
    try {
      const wasmPath = path.join(tmp, "token.wasm");
      writeFileSync(wasmPath, Buffer.from("corrupted wasm content"));
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync("node", ["scripts/verify-prebuilt.mjs", "--from-package", tmp], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      const output = (result.stdout || "") + (result.stderr || "");
      expect(output).toMatch(/hash mismatch|failed/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails when a WASM is missing", async () => {
    const tmp = createTempArtifactDir();
    try {
      const wasmPath = path.join(tmp, "payment.wasm");
      rmSync(wasmPath, { force: true });
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync("node", ["scripts/verify-prebuilt.mjs", "--from-package", tmp], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      const output = (result.stdout || "") + (result.stderr || "");
      expect(output).toMatch(/missing WASM|failed/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails when checksum is incorrect", async () => {
    const tmp = createTempArtifactDir();
    try {
      const checksumsPath = path.join(tmp, "checksums.txt");
      const raw = readFileSync(checksumsPath, "utf8");
      // Flip first character of first hash
      const corrupted = raw.replace(/^([a-f0-9])/, (m, c) => (c === "a" ? "b" : "a"));
      writeFileSync(checksumsPath, corrupted, "utf8");
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync("node", ["scripts/verify-prebuilt.mjs", "--from-package", tmp], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails when metadata and checksums artifact sets disagree", async () => {
    const tmp = createTempArtifactDir();
    try {
      const metadataPath = path.join(tmp, "metadata.json");
      const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
      // Remove one entry from metadata but keep in checksums
      delete metadata.contracts["token"];
      writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n", "utf8");
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync("node", ["scripts/verify-prebuilt.mjs", "--from-package", tmp], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      const output = (result.stdout || "") + (result.stderr || "");
      expect(output).toMatch(/mismatch|extra|missing/i);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
