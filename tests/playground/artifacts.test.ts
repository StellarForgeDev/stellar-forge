import { describe, expect, it } from "vitest";
import { getComponentBySlug } from "@/data/components";
import {
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
});
