import type { ReconciliationStatus } from "./artifact-status";

export type EnvironmentAccountRole = "admin" | "user1" | "user2" | "user3" | "beneficiary" | "depositor" | "arbiter" | "owner" | "spender" | "claimant" | "signer1" | "signer2" | "signer3" | "distributor" | "contributor" | "merchant" | "subscriber";
export interface AccountRequirement { role: EnvironmentAccountRole; required: boolean; minimumNativeBalance?: string; }
export type AssetSource = "STATIC_DEPLOYMENT" | "CONTROLLED_VERIFIED_DEPLOYMENT" | "EXTERNAL_TESTNET_ASSET" | "UNVERIFIED" | "BLOCKED_ARTIFACT";
export interface AssetBalanceRequirement { accountRole: EnvironmentAccountRole; minimumAmount: string; }
export interface AssetRequirement { alias: string; type: "contract"; source: AssetSource; artifactComponent?: string; contractId?: string; decimals?: number; admin?: string; evidenceReference?: string; minimumBalances?: AssetBalanceRequirement[]; }
export interface ContractDependencyRequirement { component: string; deploymentRequired: boolean; artifactStatusRequired: "VERIFIED_MATCH"; }
export type AuthorizationRequirement = "single-signer" | "admin" | "owner" | "spender" | "claimant" | "multi-party" | "external-cryptographic-signature";
export type TimeRequirement = { kind: "none" } | { kind: "wait-until" | "minimum-duration" | "deadline"; description: string };
export type SpecialFixtureRequirement = "merkle" | "oracle-signature" | "multisig" | "two-assets";
export interface EnvironmentProfile { componentId: string; localWorkflowExists: boolean; contractDependency: ContractDependencyRequirement; accounts: AccountRequirement[]; assets: AssetRequirement[]; contractDependencies: ContractDependencyRequirement[]; constructorConfiguration: { required: boolean; parameters: { name: string; type: string }[] }; authorization: AuthorizationRequirement[]; time: TimeRequirement; fixtures: SpecialFixtureRequirement[]; }
export interface EnvironmentContext { accounts: Partial<Record<EnvironmentAccountRole, { address: string; nativeBalance?: string }>>; assets: Record<string, import("./canonical-assets").CanonicalTestnetAsset>; deployments: Record<string, string | null>; artifactStatuses: Record<string, ReconciliationStatus[]>; controlledDeployments: Record<string, { contractId: string; artifactVerified: boolean }>; }
export const ENVIRONMENT_READINESS_STATUSES = ["READY", "MISSING_ACCOUNT", "MISSING_ASSET", "MISSING_DEPENDENCY", "ARTIFACT_MISMATCH", "MISSING_CONSTRUCTOR_CONFIGURATION", "MISSING_AUTHORIZATION_PARTICIPANT", "TIME_REQUIREMENT", "SPECIAL_FIXTURE_REQUIRED", "BLOCKED", "UNKNOWN"] as const;
export type EnvironmentReadinessStatus = (typeof ENVIRONMENT_READINESS_STATUSES)[number];
export interface EnvironmentReadinessResult { componentId: string; statuses: EnvironmentReadinessStatus[]; blockers: string[]; readyForPreflight: boolean; readyForExecution: boolean; }
export interface ReadinessMatrixRow extends EnvironmentReadinessResult { artifactVerified: boolean; deploymentAvailable: boolean; controlledDeploymentAvailable: boolean; requiredAccountsKnown: boolean; assetStrategyKnown: boolean; assetsRequired: boolean; authorizationStrategyKnown: boolean; timeStrategyKnown: boolean; specialFixtureStrategyKnown: boolean; localWorkflowExists: boolean; }
