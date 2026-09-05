import type { EnvironmentContext, EnvironmentProfile, EnvironmentReadinessResult, ReadinessMatrixRow } from "./environment-types";
import { canonicalTestnetAssets, isCanonicalAssetEligible } from "./canonical-assets";

export function evaluateEnvironmentReadiness(profile: EnvironmentProfile, context: EnvironmentContext): EnvironmentReadinessResult {
  const statuses: EnvironmentReadinessResult["statuses"] = [];
  const blockers: string[] = [];
  const artifactStatuses = context.artifactStatuses[profile.componentId] ?? [];
  const artifactVerified = artifactStatuses.includes("VERIFIED_MATCH");
  if (!artifactVerified) { statuses.push("ARTIFACT_MISMATCH"); blockers.push(artifactStatuses.includes("DEPLOYMENT_MISMATCH") ? "DEPLOYED_WASM_MISMATCH" : "Artifact evidence is not VERIFIED_MATCH."); }
  if (profile.constructorConfiguration.required && profile.constructorConfiguration.parameters.length === 0) { statuses.push("MISSING_CONSTRUCTOR_CONFIGURATION"); blockers.push("Constructor metadata is required but has no parameters."); }
  for (const account of profile.accounts.filter((item) => item.required)) {
    const available = context.accounts[account.role];
    if (!available) { statuses.push("MISSING_ACCOUNT"); blockers.push(`Missing required account role: ${account.role}.`); }
  }
  for (const asset of profile.assets) {
    const available = context.assets[asset.alias] ?? canonicalTestnetAssets.find((candidate) => candidate.alias === asset.alias && candidate.verificationStatus === "VERIFIED");
    if (!available || !isCanonicalAssetEligible(available)) { statuses.push("MISSING_ASSET"); blockers.push(`No verified canonical asset is available for: ${asset.alias}.`); }
  }
  for (const dependency of profile.contractDependencies) {
    const dependencyStatuses = context.artifactStatuses[dependency.component] ?? [];
    if (dependency.deploymentRequired && !dependencyStatuses.includes("VERIFIED_MATCH")) { statuses.push("MISSING_DEPENDENCY"); blockers.push(`Dependency ${dependency.component} lacks VERIFIED_MATCH artifact evidence.`); }
  }
  for (const authorization of profile.authorization) {
    if (authorization === "multi-party" && profile.accounts.filter((account) => account.role.startsWith("signer")).some((account) => !context.accounts[account.role])) { statuses.push("MISSING_AUTHORIZATION_PARTICIPANT"); blockers.push("Multi-party authorization participants are not all configured."); }
    if ((authorization === "external-cryptographic-signature" || authorization === "claimant") && !profile.fixtures.length) { statuses.push("SPECIAL_FIXTURE_REQUIRED"); blockers.push(`Authorization strategy ${authorization} requires a declared fixture.`); }
  }
  if (profile.time.kind !== "none") { statuses.push("TIME_REQUIREMENT"); blockers.push(`Real Testnet time strategy required: ${profile.time.description}.`); }
  for (const fixture of profile.fixtures) { statuses.push("SPECIAL_FIXTURE_REQUIRED"); blockers.push(`Special fixture strategy required: ${fixture}.`); }
  const deployment = context.artifactStatuses[profile.componentId]?.includes("VERIFIED_MATCH") && Boolean(context.controlledDeployments[profile.componentId]);
  const uniqueStatuses = [...new Set(statuses)];
  if (uniqueStatuses.length === 0) uniqueStatuses.push("READY");
  if (uniqueStatuses.includes("ARTIFACT_MISMATCH")) uniqueStatuses.push("BLOCKED");
  return { componentId: profile.componentId, statuses: uniqueStatuses, blockers: [...new Set(blockers)], readyForPreflight: !uniqueStatuses.includes("BLOCKED") && uniqueStatuses.every((status) => status === "READY"), readyForExecution: deployment && uniqueStatuses.length === 1 && uniqueStatuses[0] === "READY" };
}

export function buildReadinessMatrix(profiles: readonly EnvironmentProfile[], context: EnvironmentContext): ReadinessMatrixRow[] {
  return profiles.map((profile) => {
    const result = evaluateEnvironmentReadiness(profile, context);
    const artifactVerified = (context.artifactStatuses[profile.componentId] ?? []).includes("VERIFIED_MATCH");
    const deploymentAvailable = artifactVerified && Boolean(context.deployments[profile.componentId]);
    const controlledDeploymentAvailable = Boolean(context.controlledDeployments[profile.componentId]);
    const requiredAccountsKnown = profile.accounts.filter((account) => account.required).every((account) => Boolean(context.accounts[account.role]));
    const assetStrategyKnown = profile.assets.every((asset) => { const candidate = context.assets[asset.alias] ?? canonicalTestnetAssets.find((item) => item.alias === asset.alias); return Boolean(candidate && isCanonicalAssetEligible(candidate)); });
    const timeStrategyKnown = profile.time.kind === "none";
    const specialFixtureStrategyKnown = profile.fixtures.length === 0;
    return { ...result, artifactVerified, deploymentAvailable, controlledDeploymentAvailable, requiredAccountsKnown, assetStrategyKnown, assetsRequired: profile.assets.length > 0, authorizationStrategyKnown: profile.authorization.length > 0, timeStrategyKnown, specialFixtureStrategyKnown, localWorkflowExists: profile.localWorkflowExists };
  });
}
