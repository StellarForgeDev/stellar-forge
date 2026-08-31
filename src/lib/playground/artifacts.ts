import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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

  // An explicitly supplied directory is an explicit artifact source. It must
  // be checked before the local build so callers cannot accidentally execute
  // a different artifact merely because a Cargo target directory exists.
  if (options?.prebuiltDir && options.prebuiltDir.trim().length > 0) {
    const implementation = component.implementation;
    if (implementation) {
      candidates.push(
        path.join(getPrebuiltDir(options.prebuiltDir), `${implementation.package}.wasm`),
      );
    }
    return candidates;
  }

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
  if (options?.prebuiltDir && options.prebuiltDir.trim().length > 0) {
    const implementation = component.implementation;
    if (!implementation) return null;
    const prebuilt = path.join(
      getPrebuiltDir(options.prebuiltDir),
      `${implementation.package}.wasm`,
    );
    return existsSync(prebuilt) ? { path: prebuilt, source: "prebuilt" } : null;
  }

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

export interface ArtifactBundleValidationResult {
  ok: boolean;
  errors: string[];
  metadata?: Record<string, unknown>;
  checksums?: Map<string, string>;
}

export function validateArtifactBundle(
  artifactDir?: string,
): ArtifactBundleValidationResult {
  const dir = getPrebuiltDir(artifactDir);
  const errors: string[] = [];

  const metadataPath = path.join(dir, "metadata.json");
  const checksumsPath = path.join(dir, "checksums.txt");

  if (!existsSync(metadataPath)) {
    errors.push(`missing metadata.json in ${dir}`);
    return { ok: false, errors };
  }
  if (!existsSync(checksumsPath)) {
    errors.push(`missing checksums.txt in ${dir}`);
    return { ok: false, errors };
  }

  let metadataValue: unknown;
  try {
    metadataValue = JSON.parse(readFileSync(metadataPath, "utf8"));
  } catch (e) {
    errors.push(`invalid metadata.json: ${(e as Error).message}`);
    return { ok: false, errors };
  }

  if (!isPlainObject(metadataValue)) {
    errors.push("metadata.json root must be a non-null object");
    return { ok: false, errors };
  }
  const metadata = metadataValue;

  const requiredStrings = ["version", "gitCommit", "sdkVersion", "target", "toolchain"];
  for (const field of requiredStrings) {
    if (typeof metadata[field] !== "string" || metadata[field].trim().length === 0) {
      errors.push(`metadata.json ${field} must be a non-empty string`);
    }
  }
  if (
    metadata.gitCommit !== "unknown" &&
    (typeof metadata.gitCommit !== "string" || !/^[a-f0-9]{40}$/.test(metadata.gitCommit))
  ) {
    errors.push("metadata.json gitCommit must be a 40-character hexadecimal commit or unknown");
  }
  if (!Object.prototype.hasOwnProperty.call(metadata, "contracts")) {
    errors.push("metadata.json missing field: contracts");
  }
  if (errors.length > 0) return { ok: false, errors, metadata };

  const requiredTop = ["version", "gitCommit", "sdkVersion", "target", "toolchain", "contracts"];
  for (const field of requiredTop) {
    if (!Object.prototype.hasOwnProperty.call(metadata, field)) {
      errors.push(`metadata.json missing field: ${field}`);
    }
  }
  const contractsValue = metadata.contracts;
  if (!isPlainObject(contractsValue)) {
    errors.push("metadata.contracts must be a plain object");
    return { ok: false, errors, metadata };
  }
  const contracts = contractsValue as Record<string, unknown>;

  const slugs = Object.keys(contracts).sort();
  if (slugs.length === 0) {
    errors.push("metadata.contracts is empty");
    return { ok: false, errors, metadata };
  }

  // Parse checksums.txt
  const raw = readFileSync(checksumsPath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const checksums = new Map<string, string>();
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})\s+(\S+)$/);
    if (!match) {
      errors.push(`invalid checksums.txt line: ${line}`);
      continue;
    }
    const [, hash, file] = match;
    if (checksums.has(file)) {
      errors.push(`duplicate checksums.txt entry: ${file}`);
    } else {
      checksums.set(file, hash);
    }
  }

  if (checksums.size !== slugs.length) {
    errors.push(`metadata and checksums artifact count mismatch: ${slugs.length} vs ${checksums.size}`);
  }

  for (const slug of slugs) {
    const entry = contracts[slug];
    if (!isSafeArtifactSlug(slug)) {
      errors.push(`metadata contract key is unsafe: ${slug}`);
      continue;
    }
    if (!isPlainObject(entry)) {
      errors.push(`metadata missing entry for ${slug}`);
      continue;
    }
    const { package: pkg, crate, file, sha256 } = entry as Record<string, unknown>;
    if (typeof pkg !== "string" || typeof crate !== "string" || typeof file !== "string" || typeof sha256 !== "string") {
      errors.push(`metadata entry for ${slug} has invalid fields`);
      continue;
    }
    if (pkg !== slug) errors.push(`metadata ${slug} package mismatch: ${pkg}`);
    if (crate !== pkg.replace(/-/g, "_")) errors.push(`metadata ${slug} crate mismatch: ${crate}`);
    if (!isSafeWasmBasename(file)) {
      errors.push(`metadata ${slug} file is unsafe: ${file}`);
      continue;
    }
    if (file !== `${pkg}.wasm`) {
      errors.push(`metadata ${slug} file mismatch: expected ${pkg}.wasm, got ${file}`);
      continue;
    }
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      errors.push(`metadata ${slug} has invalid sha256: ${sha256}`);
      continue;
    }
    const filePath = safeArtifactPath(dir, file);
    if (!filePath) {
      errors.push(`metadata ${slug} file escapes artifact directory: ${file}`);
      continue;
    }
    if (!existsSync(/* turbopackIgnore: true */ filePath)) {
      errors.push(`missing WASM for ${slug}: ${filePath}`);
      continue;
    }
    const actualHash = createHash("sha256").update(readFileSync(/* turbopackIgnore: true */ filePath)).digest("hex");
    if (actualHash !== sha256) {
      errors.push(`hash mismatch for ${file}: expected ${sha256}, got ${actualHash}`);
      continue;
    }
    const checksumsHash = checksums.get(file);
    if (!checksumsHash) {
      errors.push(`checksums.txt missing entry for ${file}`);
      continue;
    }
    if (checksumsHash !== sha256) {
      errors.push(`metadata vs checksums mismatch for ${file}: ${sha256} vs ${checksumsHash}`);
      continue;
    }
  }

  for (const file of checksums.keys()) {
    if (!isSafeWasmBasename(file)) {
      errors.push(`checksums.txt filename is unsafe: ${file}`);
      continue;
    }
    const slug = file.replace(/\.wasm$/, "");
    if (!slugs.includes(slug)) {
      errors.push(`checksums.txt has extra entry not in metadata: ${file}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, metadata, checksums };
  }

  return { ok: true, errors: [], metadata, checksums };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSafeArtifactSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isSafeWasmBasename(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*\.wasm$/.test(value) && !path.isAbsolute(value);
}

function safeArtifactPath(dir: string, file: string): string | null {
  if (!isSafeWasmBasename(file)) return null;
  const root = path.resolve(dir);
  const resolved = path.resolve(root, file);
  const relative = path.relative(root, resolved);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}
