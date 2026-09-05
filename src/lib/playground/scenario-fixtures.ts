import type { StellarComponent } from "@/data/components";
import { IDENTITY_OPTIONS } from "@/lib/playground/execution";
import { hash, Keypair, StrKey } from "@stellar/stellar-sdk";
import type { MerkleFixtureDefinition, OracleFixtureDefinition, PlaygroundScenario, ScenarioFixtures } from "@/lib/playground/scenario-types";

export interface AssetFixtureDefinition { id: string; dependencyAlias: string; symbol: string; decimals: number; }

export const scenarioAssets: readonly AssetFixtureDefinition[] = [
  { id: "forge-token", dependencyAlias: "asset", symbol: "FORGE", decimals: 7 },
];

export function createOracleSignatureFixture(input: {
  id: string;
  signer: string;
  price: string | number;
  timestamp: string | number;
}): OracleFixtureDefinition {
  const secret = Buffer.alloc(32, 0x42);
  const keypair = Keypair.fromRawEd25519Seed(secret);
  const price = BigInt(String(input.price));
  const timestamp = BigInt(String(input.timestamp));
  const messageBytes = concat([
    new TextEncoder().encode("ORACLE-V1"),
    signedInteger(price, 8),
    unsignedInteger(timestamp, 8),
  ]);
  const signature = keypair.sign(Buffer.from(messageBytes));
  return {
    ...input,
    price: String(input.price),
    timestamp: String(input.timestamp),
    publicKey: toHex(StrKey.decodeEd25519PublicKey(keypair.publicKey())),
    message: toHex(messageBytes),
    signature: toHex(signature),
  };
}

function signedInteger(value: bigint, width: number): Uint8Array {
  let encoded = value;
  if (encoded < BigInt(0)) encoded += BigInt(1) << BigInt(width * 8);
  return unsignedInteger(encoded, width);
}
function unsignedInteger(value: bigint, width: number): Uint8Array {
  const bytes = new Uint8Array(width);
  for (let i = 0; i < width; i++) bytes[width - 1 - i] = Number((value >> BigInt(i * 8)) & BigInt(255));
  return bytes;
}

const DEFAULT_ADDRESSES: Record<string, string> = {
  admin: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
  user1: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4",
  user2: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M",
};

export function createMerkleFixture(input: {
  id: string;
  asset?: string;
  leaves: { index: number; claimant: string; amount: string | number }[];
}): MerkleFixtureDefinition {
  const leaves = input.leaves.map((leaf) => ({ ...leaf, amount: String(leaf.amount) }));
  const hashes = leaves.map((leaf) => merkleLeaf(leaf.index, resolveAddress(leaf.claimant), leaf.amount));
  const levels: Uint8Array[][] = [hashes];
  while (levels[levels.length - 1].length > 1) {
    const current = levels[levels.length - 1];
    const next: Uint8Array[] = [];
    for (let index = 0; index < current.length; index += 2) next.push(combine(current[index], current[index + 1] ?? current[index]));
    levels.push(next);
  }
  const proofs: Record<string, string> = {};
  for (let leafIndex = 0; leafIndex < leaves.length; leafIndex++) {
    const siblings: Uint8Array[] = [];
    let index = leafIndex;
    for (let level = 0; level < levels.length - 1; level++) {
      const current = levels[level];
      siblings.push(index % 2 === 0 ? current[index + 1] ?? current[index] : current[index - 1]);
      index = Math.floor(index / 2);
    }
    proofs[String(leaves[leafIndex].index)] = toHex(concat(siblings));
  }
  return { ...input, leaves, root: toHex(levels[levels.length - 1][0]), proofs };
}

export function resolveScenarioFixtureReference(
  reference: string,
  fixtures: ScenarioFixtures | undefined,
): { ok: true; value: string } | { ok: false; error: string } {
  const parts = reference.split(".");
  const fixture = fixtures?.merkle?.find((candidate) => candidate.id === parts[0]);
  if (fixture) {
    if (parts[1] === "root" && parts.length === 2) return { ok: true, value: fixture.root };
    if (parts[1] === "proof" && parts.length === 3 && fixture.proofs[parts[2]]) return { ok: true, value: fixture.proofs[parts[2]] };
  }
  const oracle = fixtures?.oracle?.find((candidate) => candidate.id === parts[0]);
  if (oracle && parts.length === 2 && ["publicKey", "message", "signature"].includes(parts[1])) {
    return { ok: true, value: oracle[parts[1] as "publicKey" | "message" | "signature"] };
  }
  return { ok: false, error: `fixture value is unavailable: ${reference}` };
}

function resolveAddress(name: string): string { return DEFAULT_ADDRESSES[name] ?? name; }
function merkleLeaf(index: number, claimant: string, amount: string): Uint8Array {
  const bytes = new Uint8Array(21 + claimant.length + 16);
  bytes.set(new TextEncoder().encode("MERKLE-AIRDROP-V1"), 0);
  new DataView(bytes.buffer).setUint32(17, index, false);
  bytes.set(new TextEncoder().encode(claimant), 21);
  let value = BigInt(amount);
  if (value < 0) value += BigInt(1) << BigInt(128);
  for (let i = 0; i < 16; i++) bytes[bytes.length - 1 - i] = Number((value >> BigInt(i * 8)) & BigInt(255));
  return hash(Buffer.from(bytes));
}
function combine(left: Uint8Array, right: Uint8Array): Uint8Array {
  const ordered = Buffer.compare(Buffer.from(left), Buffer.from(right)) <= 0 ? [left, right] : [right, left];
  return hash(Buffer.from(concat(ordered)));
}
function concat(parts: readonly Uint8Array[]): Uint8Array { const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out; }
function toHex(value: Uint8Array): string { return `0x${Buffer.from(value).toString("hex")}`; }

const SEMANTIC_IDENTITIES = new Set([
  ...IDENTITY_OPTIONS, "owner", "depositor", "beneficiary", "arbiter",
  "contributor", "merchant", "subscriber", "signer1", "signer2", "signer3",
]);

export function validateScenarioFixtures(scenario: PlaygroundScenario, component: StellarComponent): string[] {
  const fixtures = scenario.fixtures;
  if (!fixtures) return [];
  const issues: string[] = [];
  const identities = fixtures.identities ?? [];
  const assets = fixtures.assets ?? [];
  const merkle = fixtures.merkle ?? [];
  const oracle = fixtures.oracle ?? [];
  const multisig = fixtures.multisig ?? [];
  if (new Set(merkle.map((fixture) => fixture.id)).size !== merkle.length) issues.push("Merkle fixture IDs must be unique");
  for (const fixture of merkle) {
    if (fixture.leaves.length === 0) issues.push(`Merkle fixture ${fixture.id} must contain a leaf`);
    if (fixture.asset && !assets.includes(fixture.asset)) issues.push(`Merkle fixture ${fixture.id} references an undeclared asset: ${fixture.asset}`);
    for (const leaf of fixture.leaves) {
      if (!identities.includes(leaf.claimant)) issues.push(`Merkle fixture ${fixture.id} references an undeclared claimant: ${leaf.claimant}`);
      if (!isNonNegativeInteger(leaf.amount) || BigInt(String(leaf.amount)) === BigInt(0)) issues.push(`Merkle fixture ${fixture.id} has an invalid amount`);
    }
  }
  if (new Set(oracle.map((fixture) => fixture.id)).size !== oracle.length) issues.push("Oracle fixture IDs must be unique");
  for (const fixture of oracle) {
    if (!identities.includes(fixture.signer)) issues.push(`Oracle fixture ${fixture.id} references an undeclared signer: ${fixture.signer}`);
    if (!isI64(fixture.price)) issues.push(`Oracle fixture ${fixture.id} has an invalid price`);
    if (!isU64(fixture.timestamp)) issues.push(`Oracle fixture ${fixture.id} has an invalid timestamp`);
    if (!/^0x[0-9a-f]{64}$/.test(fixture.publicKey)) issues.push(`Oracle fixture ${fixture.id} public key must be 32 bytes`);
    if (!/^0x[0-9a-f]{128}$/.test(fixture.signature)) issues.push(`Oracle fixture ${fixture.id} signature must be 64 bytes`);
  }
  if (new Set(multisig.map((fixture) => fixture.id)).size !== multisig.length) issues.push("multi-party fixture IDs must be unique");
  for (const fixture of multisig) {
    if (fixture.signers.length === 0) issues.push(`multi-party fixture ${fixture.id} must contain a signer`);
    if (new Set(fixture.signers).size !== fixture.signers.length) issues.push(`multi-party fixture ${fixture.id} contains duplicate signers`);
    for (const signer of fixture.signers) {
      if (!identities.includes(signer)) issues.push(`multi-party fixture ${fixture.id} references an undeclared signer: ${signer}`);
    }
    if (!isPositiveInteger(fixture.threshold) || BigInt(String(fixture.threshold)) > BigInt(fixture.signers.length)) {
      issues.push(`multi-party fixture ${fixture.id} has an invalid threshold`);
    }
  }
  if (new Set(identities).size !== identities.length) issues.push("fixture identities must be unique");
  for (const identity of identities) if (!SEMANTIC_IDENTITIES.has(identity)) issues.push(`unknown fixture identity: ${identity}`);
  if (new Set(assets).size !== assets.length) issues.push("fixture assets must be unique");
  for (const assetId of assets) {
    const asset = scenarioAssets.find((candidate) => candidate.id === assetId);
    if (!asset) { issues.push(`unknown asset fixture: ${assetId}`); continue; }
    if (!(component.dependencies ?? []).some((dependency) => dependency.alias === asset.dependencyAlias)) issues.push(`asset fixture ${assetId} requires dependency alias ${asset.dependencyAlias}`);
  }
  for (const [index, balance] of (fixtures.balances ?? []).entries()) {
    if (!identities.includes(balance.identity)) issues.push(`fixtures.balances[${index}] references an undeclared identity: ${balance.identity}`);
    if (!assets.includes(balance.asset)) issues.push(`fixtures.balances[${index}] references an undeclared asset: ${balance.asset}`);
    if (!isNonNegativeInteger(balance.amount)) issues.push(`fixtures.balances[${index}].amount must be a non-negative integer`);
  }
  return issues;
}

function isNonNegativeInteger(value: unknown): boolean {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return false;
  try { return BigInt(value) <= BigInt("170141183460469231731687303715884105727"); } catch { return false; }
}
function isPositiveInteger(value: unknown): boolean {
  if (!isNonNegativeInteger(value)) return false;
  try { return BigInt(String(value)) > BigInt(0); } catch { return false; }
}
function isU64(value: unknown): boolean { if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0; if (typeof value !== "string" || !/^\d+$/.test(value)) return false; try { return BigInt(value) <= BigInt("18446744073709551615"); } catch { return false; } }
function isI64(value: unknown): boolean { if (typeof value === "number") return Number.isSafeInteger(value); if (typeof value !== "string" || !/^-?\d+$/.test(value)) return false; try { const n = BigInt(value); return n >= BigInt("-9223372036854775808") && n <= BigInt("9223372036854775807"); } catch { return false; } }
