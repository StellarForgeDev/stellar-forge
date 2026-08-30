import { existsSync } from "node:fs";
import path from "node:path";
import {
  componentWasmPath,
  type StellarComponent,
} from "@/data/components";

export interface ResolvedArtifact {
  path: string;
  source: "local-build" | "prebuilt";
}

const PROJECT_ROOT = process.cwd();

function getDefaultPrebuiltDir(): string {
  const envDir = process.env.PREBUILT_WASM_DIR;
  if (envDir && envDir.trim().length > 0) {
    return path.isAbsolute(envDir) ? envDir : path.join(/* turbopackIgnore: true */ PROJECT_ROOT, envDir);
  }
  return path.join(/* turbopackIgnore: true */ PROJECT_ROOT, "contracts", "prebuilt");
}

const PREBUILT_DIR = getDefaultPrebuiltDir();

export function getPrebuiltDir(prebuiltDir?: string): string {
  if (prebuiltDir && prebuiltDir.trim().length > 0) {
    return path.isAbsolute(prebuiltDir) ? prebuiltDir : path.join(/* turbopackIgnore: true */ PROJECT_ROOT, prebuiltDir);
  }
  return getDefaultPrebuiltDir();
}

/**
 * Candidate paths for the native sandbox-runner executable, in preference
 * order. On Windows only native `.exe` builds are considered: the committed
 * Linux binary must never be executed on Windows (exec format mismatch).
 */
export function runnerCandidates(
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform === "win32") {
    return [
      path.join(PROJECT_ROOT, "contracts", "target", "debug", "sandbox-runner.exe"),
      path.join(PROJECT_ROOT, "contracts", "target", "release", "sandbox-runner.exe"),
    ];
  }
  if (platform === "linux" || platform === "darwin") {
    return [
      path.join(PROJECT_ROOT, "contracts", "target", "release", "sandbox-runner"),
      path.join(PROJECT_ROOT, "contracts", "target", "debug", "sandbox-runner"),
    ];
  }
  return [];
}

export function resolveRunner(
  platform?: NodeJS.Platform,
): ResolvedArtifact | null {
  for (const candidate of runnerCandidates(platform)) {
    if (existsSync(candidate)) {
      return { path: candidate, source: "local-build" };
    }
  }
  return null;
}

/**
 * Candidate wasm paths for a component, in preference order: the locally
 * built artifact first, then the committed prebuilt copy. The wasm is
 * platform-independent, so the prebuilt copy is valid on every deployment.
 *
 * The prebuilt directory can be supplied explicitly (e.g., from an external
 * artifact package) via `options.prebuiltDir` or the `PREBUILT_WASM_DIR` env
 * variable. The default remains `contracts/prebuilt` for the current monorepo.
 */
export function wasmCandidates(
  component: StellarComponent,
  options?: { prebuiltDir?: string },
): string[] {
  const candidates: string[] = [];

  const local = componentWasmPath(component);
  if (local) {
    // Artifact paths are runtime-computed; inclusion is handled explicitly
    // via next.config.ts outputFileTracingIncludes for /api/playground.
    candidates.push(path.join(/* turbopackIgnore: true */ PROJECT_ROOT, local));
  }

  const implementation = component.implementation;
  if (implementation) {
    const prebuiltDir = getPrebuiltDir(options?.prebuiltDir);
    candidates.push(
      path.join(prebuiltDir, `${implementation.package}.wasm`),
    );
  }

  return candidates;
}

export function resolveWasm(
  component: StellarComponent,
  options?: { prebuiltDir?: string },
): ResolvedArtifact | null {
  const local = componentWasmPath(component);
  if (local && existsSync(path.join(/* turbopackIgnore: true */ PROJECT_ROOT, local))) {
    return {
      path: path.join(/* turbopackIgnore: true */ PROJECT_ROOT, local),
      source: "local-build",
    };
  }

  const implementation = component.implementation;
  if (implementation) {
    const prebuiltDir = getPrebuiltDir(options?.prebuiltDir);
    const prebuilt = path.join(prebuiltDir, `${implementation.package}.wasm`);
    if (existsSync(prebuilt)) {
      return { path: prebuilt, source: "prebuilt" };
    }
  }

  return null;
}

export const PREBUILT_DIR_PATH = PREBUILT_DIR;