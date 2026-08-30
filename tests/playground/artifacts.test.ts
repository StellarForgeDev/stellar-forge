import { describe, expect, it } from "vitest";
import { getComponentBySlug } from "@/data/components";
import {
  getPrebuiltDir,
  PREBUILT_DIR_PATH,
  resolveRunner,
  resolveWasm,
  runnerCandidates,
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
        // If local build exists, source will be local-build; otherwise it must be prebuilt from tmp.
        if (result) {
          expect(typeof result.path).toBe("string");
          // When local build is absent, it must resolve to tmp/token.wasm
          if (result.source === "prebuilt") {
            expect(result.path.replace(/\\/g, "/")).toBe(fakeWasm.replace(/\\/g, "/"));
          }
        } else {
          // Should not happen because we just created the file
          expect(result).not.toBeNull();
        }
      } finally {
        try {
          rmSync(tmp, { recursive: true, force: true });
        } catch {}
      }
    });
  });
});
