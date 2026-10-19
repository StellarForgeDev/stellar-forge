import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "verification", "component-verification-manifest.json");
const catalogPath = path.join(root, "src", "data", "components.ts");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const catalog = await readFile(catalogPath, "utf8");
const catalogSlugs = [...catalog.matchAll(/slug:\s*["`]([^"`]+)["`]/g)].map((match) => match[1]);
const entries = manifest.components;
const errors = [];
const allowed = {
  catalog: new Set(["declared"]),
  sandbox: new Set(["tested", "not-established"]),
  testnetRegistry: new Set(["declared", "absent"]),
  testnetBehavior: new Set(["partial-name-flow", "verified", "unverified"]),
  artifactParity: new Set(["match", "mismatch-recorded", "not-established"]),
  candidateAuthorization: new Set(["separate", "not-applicable"]),
};
const mismatchAssessments = new Set(["historical-deployment-before-current-prebuilt-alignment"]);

if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
if (!Array.isArray(entries) || entries.length !== catalogSlugs.length) errors.push(`manifest must contain exactly ${catalogSlugs.length} catalog entries`);
const manifestSlugs = entries.map((entry) => entry?.slug);
if (new Set(manifestSlugs).size !== manifestSlugs.length) errors.push("manifest slugs must be unique");
for (const slug of catalogSlugs) if (!manifestSlugs.includes(slug)) errors.push(`missing catalog slug: ${slug}`);
for (const slug of manifestSlugs) if (!catalogSlugs.includes(slug)) errors.push(`unknown manifest slug: ${slug}`);

for (const entry of entries) {
  for (const [field, values] of Object.entries(allowed)) {
    if (!values.has(entry?.[field])) errors.push(`${entry?.slug ?? "<unknown>"}.${field} has an invalid value`);
  }
  if (entry?.candidateAuthorization !== "separate") errors.push(`${entry?.slug ?? "<unknown>"} must keep candidate authorization separate`);
  if (entry?.artifactParity === "mismatch-recorded" && !mismatchAssessments.has(entry?.mismatchAssessment)) errors.push(`${entry?.slug ?? "<unknown>"} must document its mismatch assessment`);
}

const supported = manifest.publicSupport?.supportedComponents;
if (!Array.isArray(supported) || supported.length < 3 || supported.length > 5) errors.push("publicSupport.supportedComponents must contain 3 to 5 components");
for (const slug of supported ?? []) if (!manifestSlugs.includes(slug)) errors.push(`unsupported component is not in the manifest: ${slug}`);
if (manifest.publicSupport?.mainnet !== "unavailable") errors.push("mainnet must remain unavailable");
if (manifest.publicSupport?.blockchainMutationPerformed !== false) errors.push("manifest must record no blockchain mutation");

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(`Component verification manifest valid: ${entries.length} catalog entries; ${supported.length} public local/Testnet-preparation components.`);
