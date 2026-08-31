import { describe, expect, it } from "vitest";
import { getComponentBySlug } from "@/data/components";
import {
  getPrebuiltDir,
  PREBUILT_DIR_PATH,
  resolveRunner,
  resolveWasm,
  runnerCandidates,
  validateArtifactBundle,
  wasmCandidates,
} from "@/lib/playground/artifacts";

const token = getComponentBySlug("token")!;

describe("artifact resolution (pure boundaries)", () => {
  describe("runnerCandidates", () => {
    it("prefers .exe builds on Windows", () => {
      const candidates = runnerCandidates("win32");
      expect(candidates).toHaveLength(2);
      expect(candidates.every((c) => c.endsWith(".exe"))).toBe(true);
    });

    it("prefers the release binary first on Linux", () => {
      const candidates = runnerCandidates("linux");
      expect(candidates).toHaveLength(2);
      expect(candidates[0]).toContain("release");
      expect(candidates[0].endsWith(".exe")).toBe(false);
    });

    it("prefers the release binary first on macOS", () => {
      const candidates = runnerCandidates("darwin");
      expect(candidates).toHaveLength(2);
      expect(candidates[0]).toContain("release");
    });

    it("returns no candidates for unsupported platforms", () => {
      expect(runnerCandidates("freebsd")).toEqual([]);
    });
  });

  describe("wasmCandidates", () => {
    it("lists the local build and the prebuilt copy", () => {
      const candidates = wasmCandidates(token);
      expect(candidates.length).toBeGreaterThanOrEqual(2);
      expect(candidates.some((c) => c.includes("token.wasm"))).toBe(true);
    });

    it("includes the prebuilt directory path", () => {
      expect(PREBUILT_DIR_PATH.replace(/\\/g, "/")).toContain(
        "contracts/prebuilt",
      );
    });
  });

  describe("filesystem-aware resolvers", () => {
    it("resolveRunner returns an artifact or null without throwing", () => {
      const result = resolveRunner();
      expect(result === null || typeof result.path === "string").toBe(true);
      if (result) expect(result.source).toBe("local-build");
    });

    it("resolveWasm returns an artifact or null without throwing", () => {
      const result = resolveWasm(token);
      expect(result === null || typeof result.path === "string").toBe(true);
    });
  });

  describe("decoupled prebuilt directory", () => {
    it("getPrebuiltDir returns the default contracts/prebuilt when no override is given", () => {
      const dir = getPrebuiltDir();
      expect(dir.replace(/\\/g, "/")).toContain("contracts/prebuilt");
    });

    it("getPrebuiltDir respects an explicit absolute override", () => {
      const custom = "/tmp/custom-prebuilt";
      expect(getPrebuiltDir(custom)).toBe(custom);
    });

    it("wasmCandidates includes the supplied prebuiltDir for the package file", () => {
      const custom = "/tmp/custom-prebuilt";
      const candidates = wasmCandidates(token, { prebuiltDir: custom });
      expect(candidates.some((c) => c === `${custom.replace(/\\/g, "/")}/token.wasm` || c.includes("token.wasm"))).toBe(true);
      expect(candidates.some((c) => c.replace(/\\/g, "/").startsWith(custom.replace(/\\/g, "/")))).toBe(true);
    });

    it("resolveWasm can be pointed at an arbitrary artifact directory without knowing that it belongs to contracts/", async () => {
      const { mkdirSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = path.join(tmpdir(), `stellar-forge-prebuilt-test-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
      const fakeWasm = path.join(tmp, "token.wasm");
      writeFileSync(fakeWasm, Buffer.from("fake wasm"));
      try {
        // Ensure the real local build does not interfere: we are checking that
        // the prebuilt fallback is taken from the supplied dir, not from
        // contracts/prebuilt. The test uses a component whose local build may
        // or may not exist; the prebuilt from tmp should be considered.
        const result = resolveWasm(token, { prebuiltDir: tmp });
        expect(result).not.toBeNull();
        expect(result!.source).toBe("prebuilt");
        expect(result!.path.replace(/\\/g, "/")).toBe(fakeWasm.replace(/\\/g, "/"));
      } finally {
        try {
          rmSync(tmp, { recursive: true, force: true });
        } catch {}
      }
    });
  });

  describe("external artifact directory contract", () => {
    it("resolves WASM from an external directory without requiring contracts/prebuilt", async () => {
      const { mkdirSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = path.join(tmpdir(), `stellar-forge-external-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
      try {
        // Use a fake component that has no local build, so prebuilt fallback is exercised
        const fakeComponent = {
          ...token,
          slug: "fake-external-test",
          implementation: {
            language: "rust" as const,
            package: "fake-external-test",
            sourcePath: "contracts/contracts/fake",
            buildTarget: "wasm32v1-none",
          },
        };
        const fakeWasm = path.join(tmp, "fake-external-test.wasm");
        writeFileSync(fakeWasm, Buffer.from("fake wasm for external test"));
        const result = resolveWasm(fakeComponent as unknown as typeof token, { prebuiltDir: tmp });
        expect(result).not.toBeNull();
        expect(result!.path.replace(/\\/g, "/")).toBe(fakeWasm.replace(/\\/g, "/"));
        expect(result!.source).toBe("prebuilt");
        // Verify wasmCandidates also includes it
        const candidates = wasmCandidates(fakeComponent as unknown as typeof token, { prebuiltDir: tmp });
        expect(candidates.some((c) => c.replace(/\\/g, "/") === fakeWasm.replace(/\\/g, "/"))).toBe(true);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("monorepo fallback still works: resolveWasm(token) without override resolves contracts/prebuilt", () => {
      const result = resolveWasm(token);
      expect(result).not.toBeNull();
      // Should be either local-build or prebuilt from default
      expect(result!.source === "local-build" || result!.source === "prebuilt").toBe(true);
      if (result!.source === "prebuilt") {
        expect(result!.path.replace(/\\/g, "/")).toContain("contracts/prebuilt/token.wasm");
      }
    });

    it("environment override PREBUILT_WASM_DIR allows resolution without explicit prebuiltDir", async () => {
      const { mkdirSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = path.join(tmpdir(), `stellar-forge-env-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
      const fakeWasm = path.join(tmp, "token.wasm");
      writeFileSync(fakeWasm, Buffer.from("fake wasm env"));
      const original = process.env.PREBUILT_WASM_DIR;
      try {
        process.env.PREBUILT_WASM_DIR = tmp;
        // Need to re-evaluate getPrebuiltDir after env change — it reads env on each call
        const resolved = getPrebuiltDir();
        expect(resolved.replace(/\\/g, "/")).toBe(tmp.replace(/\\/g, "/"));
        const result = resolveWasm(token);
        // With env set, and assuming no local build, it should resolve to tmp
        // But local build may exist, so check that if source is prebuilt, it's from tmp
        if (result && result.source === "prebuilt") {
          expect(result.path.replace(/\\/g, "/")).toBe(fakeWasm.replace(/\\/g, "/"));
        } else {
          // If local build exists, we can't assert prebuilt, but getPrebuiltDir must still be tmp
          expect(resolved).toBe(tmp);
        }
      } finally {
        if (original === undefined) delete process.env.PREBUILT_WASM_DIR;
        else process.env.PREBUILT_WASM_DIR = original;
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe("artifact bundle validation", () => {
    it("validates the real contracts/prebuilt bundle successfully", async () => {
      const result = validateArtifactBundle();
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails when requested WASM does not exist in external dir", async () => {
      const { mkdirSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = path.join(tmpdir(), `stellar-forge-missing-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
      try {
        // Copy metadata/checksums but not WASM
        const prebuilt = getPrebuiltDir();
        const { copyFileSync } = await import("node:fs");
        copyFileSync(path.join(prebuilt, "metadata.json"), path.join(tmp, "metadata.json"));
        copyFileSync(path.join(prebuilt, "checksums.txt"), path.join(tmp, "checksums.txt"));
        // Intentionally leave token.wasm missing
        const result = validateArtifactBundle(tmp);
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.includes("missing WASM"))).toBe(true);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("fails when checksum is incorrect", async () => {
      const { mkdirSync, copyFileSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = path.join(tmpdir(), `stellar-forge-badhash-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
      try {
        const prebuilt = getPrebuiltDir();
        for (const file of ["token.wasm", "metadata.json", "checksums.txt"]) {
          copyFileSync(path.join(prebuilt, file), path.join(tmp, file));
        }
        // Corrupt token.wasm
        writeFileSync(path.join(tmp, "token.wasm"), Buffer.from("corrupted"));
        const result = validateArtifactBundle(tmp);
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.includes("hash mismatch"))).toBe(true);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("fails when metadata points to nonexistent WASM", async () => {
      const { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = path.join(tmpdir(), `stellar-forge-badmeta-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
      try {
        const prebuilt = getPrebuiltDir();
        // Copy all WASM and checksums, but modify metadata to reference nonexistent file
        for (const file of ["token.wasm", "checksums.txt"]) {
          copyFileSync(path.join(prebuilt, file), path.join(tmp, file));
        }
        const metadata = JSON.parse(readFileSync(path.join(prebuilt, "metadata.json"), "utf8"));
        metadata.contracts["ghost"] = { package: "ghost", crate: "ghost", file: "ghost.wasm", sha256: "a".repeat(64) };
        writeFileSync(path.join(tmp, "metadata.json"), JSON.stringify(metadata, null, 2));
        const result = validateArtifactBundle(tmp);
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.includes("ghost") || e.includes("missing WASM"))).toBe(true);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("fails when checksums entry is missing", async () => {
      const { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = path.join(tmpdir(), `stellar-forge-missing-checksum-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
      try {
        const prebuilt = getPrebuiltDir();
        for (const file of ["token.wasm", "metadata.json"]) {
          copyFileSync(path.join(prebuilt, file), path.join(tmp, file));
        }
        // Write checksums without token.wasm
        const raw = readFileSync(path.join(prebuilt, "checksums.txt"), "utf8");
        const lines = raw.split("\n").filter((l) => !l.includes("token.wasm"));
        writeFileSync(path.join(tmp, "checksums.txt"), lines.join("\n"));
        const result = validateArtifactBundle(tmp);
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.includes("mismatch") || e.includes("missing"))).toBe(true);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("fails when metadata and checksums sets disagree", async () => {
      const { validateArtifactBundle } = await import("@/lib/playground/artifacts");
      const { mkdirSync, copyFileSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = path.join(tmpdir(), `stellar-forge-disagree-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
      try {
        const prebuilt = getPrebuiltDir();
        copyFileSync(path.join(prebuilt, "token.wasm"), path.join(tmp, "token.wasm"));
        copyFileSync(path.join(prebuilt, "metadata.json"), path.join(tmp, "metadata.json"));
        // Write checksums with only token, but metadata has 15 -> mismatch
        // Use actual computed hash
        const { createHash } = await import("node:crypto");
        const { readFileSync: rfs } = await import("node:fs");
        const h = createHash("sha256").update(rfs(path.join(prebuilt, "token.wasm"))).digest("hex");
        writeFileSync(path.join(tmp, "checksums.txt"), `${h}  token.wasm\n`);
        const result = validateArtifactBundle(tmp);
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.includes("mismatch") || e.includes("count"))).toBe(true);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it.each([
      ["invalid JSON", "{"],
      ["null", "null"],
      ["array", "[]"],
      ["primitive", '"metadata"'],
    ])("fails safely for malformed metadata root: %s", async (_label, contents) => {
      const { mkdirSync, copyFileSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = path.join(tmpdir(), `stellar-forge-malformed-${Date.now()}-${Math.random()}`);
      mkdirSync(tmp, { recursive: true });
      try {
        copyFileSync(path.join(getPrebuiltDir(), "checksums.txt"), path.join(tmp, "checksums.txt"));
        writeFileSync(path.join(tmp, "metadata.json"), contents);
        expect(() => validateArtifactBundle(tmp)).not.toThrow();
        const result = validateArtifactBundle(tmp);
        expect(result.ok).toBe(false);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("fails safely for missing and incorrectly typed metadata fields", async () => {
      const { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = path.join(tmpdir(), `stellar-forge-field-types-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
      try {
        const prebuilt = getPrebuiltDir();
        copyFileSync(path.join(prebuilt, "checksums.txt"), path.join(tmp, "checksums.txt"));
        const metadata = JSON.parse(readFileSync(path.join(prebuilt, "metadata.json"), "utf8"));
        delete metadata.version;
        metadata.sdkVersion = 27;
        writeFileSync(path.join(tmp, "metadata.json"), JSON.stringify(metadata));
        const result = validateArtifactBundle(tmp);
        expect(result.ok).toBe(false);
        expect(result.errors.join(" ")).toMatch(/version|sdkVersion/);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it.each([
      ["metadata filename traversal", "metadata", "../outside.wasm"],
      ["metadata nested filename", "metadata", "subdir/file.wasm"],
      ["metadata absolute filename", "metadata", "C:\\evil.wasm"],
      ["checksum filename traversal", "checksums", "../outside.wasm"],
      ["checksum nested filename", "checksums", "subdir/file.wasm"],
      ["checksum absolute filename", "checksums", "C:\\evil.wasm"],
    ])("rejects %s", async (_label, source, unsafeFile) => {
      const { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = path.join(tmpdir(), `stellar-forge-traversal-${Date.now()}-${Math.random()}`);
      mkdirSync(tmp, { recursive: true });
      try {
        const prebuilt = getPrebuiltDir();
        for (const file of ["metadata.json", "checksums.txt"]) {
          copyFileSync(path.join(prebuilt, file), path.join(tmp, file));
        }
        const metadata = JSON.parse(readFileSync(path.join(prebuilt, "metadata.json"), "utf8"));
        const tokenHash = metadata.contracts.token.sha256;
        if (source === "metadata") {
          metadata.contracts.token.file = unsafeFile;
          writeFileSync(path.join(tmp, "metadata.json"), JSON.stringify(metadata));
        } else {
          const checksums = readFileSync(path.join(prebuilt, "checksums.txt"), "utf8");
          writeFileSync(path.join(tmp, "checksums.txt"), checksums.replace(`${tokenHash}  token.wasm`, `${tokenHash}  ${unsafeFile}`));
        }
        const result = validateArtifactBundle(tmp);
        expect(result.ok).toBe(false);
        expect(result.errors.join(" ")).toMatch(/unsafe|mismatch|missing/);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("rejects metadata semantic mismatches", async () => {
      const { mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = await import("node:path");
      const tmp = path.join(tmpdir(), `stellar-forge-semantic-${Date.now()}`);
      mkdirSync(tmp, { recursive: true });
      try {
        const prebuilt = getPrebuiltDir();
        copyFileSync(path.join(prebuilt, "checksums.txt"), path.join(tmp, "checksums.txt"));
        const metadata = JSON.parse(readFileSync(path.join(prebuilt, "metadata.json"), "utf8"));
        metadata.contracts.token.package = "other";
        metadata.contracts.token.crate = "other_crate";
        writeFileSync(path.join(tmp, "metadata.json"), JSON.stringify(metadata));
        const result = validateArtifactBundle(tmp);
        expect(result.ok).toBe(false);
        expect(result.errors.join(" ")).toMatch(/package mismatch|crate mismatch/);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});
