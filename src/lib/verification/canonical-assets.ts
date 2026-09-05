import type { AssetRequirement, AssetSource } from "./environment-types";

export interface CanonicalTestnetAsset extends AssetRequirement { alias: string; source: AssetSource; verificationStatus: "UNVERIFIED" | "VERIFIED" | "BLOCKED"; }
export const canonicalTestnetAssets: CanonicalTestnetAsset[] = [];
export function isCanonicalAssetEligible(asset: CanonicalTestnetAsset): boolean { return Boolean(asset.contractId && asset.verificationStatus === "VERIFIED" && (asset.source === "CONTROLLED_VERIFIED_DEPLOYMENT" || asset.source === "EXTERNAL_TESTNET_ASSET")); }
