import type { FunctionSpec } from "@/data/components";

export type ScenarioStepKind = "call" | "observation" | "clock";

export interface ScenarioClockAction { advanceBySeconds: string | number; }
export interface ScenarioClock {
  initialLedgerTimestamp?: string | number;
  initialLedgerSequence?: string | number;
  maxAdvanceSeconds?: string | number;
}

export interface ScenarioSeededBalance { identity: string; asset: string; amount: string | number; }
export interface ScenarioFixtures {
  identities?: string[];
  assets?: string[];
  balances?: ScenarioSeededBalance[];
  merkle?: MerkleFixtureDefinition[];
  oracle?: OracleFixtureDefinition[];
  multisig?: MultiPartyFixtureDefinition[];
  constructorValues?: Record<string, string>;
}

export interface OracleFixtureDefinition {
  id: string;
  signer: string;
  price: string | number;
  timestamp: string | number;
  publicKey: string;
  message: string;
  signature: string;
}

export interface MultiPartyFixtureDefinition {
  id: string;
  signers: string[];
  threshold: string | number;
}

export interface MerkleLeafDefinition { index: number; claimant: string; amount: string | number; }
export interface MerkleFixtureDefinition {
  id: string;
  asset?: string;
  leaves: MerkleLeafDefinition[];
  root: string;
  proofs: Record<string, string>;
}

export type ScenarioExpectedResult = string | number | boolean | null;

export interface ScenarioResultReference {
  reference: string;
}

export type ScenarioArgument =
  | string
  | number
  | boolean
  | null
  | ScenarioResultReference
  | { fixture: string };

export type ScenarioComparisonRelation =
  | "changed"
  | "unchanged"
  | "increased"
  | "decreased";

export interface ScenarioComparison {
  compareWith: string;
  relation: ScenarioComparisonRelation;
}

export interface ScenarioComparisonResult {
  relation: ScenarioComparisonRelation;
  before: unknown;
  after: unknown;
  delta?: string;
  passed: boolean;
}

export interface ScenarioStep {
  id: string;
  title: string;
  explanation: string;
  kind: ScenarioStepKind;
  method: string;
  args: ScenarioArgument[];
  expected?: ScenarioExpectedResult;
  resultLabel?: string;
  comparison?: ScenarioComparison;
  authorization?: string;
  clock?: ScenarioClockAction;
}

export interface PlaygroundScenario {
  id: string;
  componentSlug: string;
  title: string;
  description: string;
  steps: ScenarioStep[];
  clock?: ScenarioClock;
  fixtures?: ScenarioFixtures;
}

export interface ScenarioValidationIssue {
  path: string;
  message: string;
}

export interface GuidedStepResult {
  scenarioStep: ScenarioStep;
  functionSpec: FunctionSpec;
  args: ScenarioArgument[];
  status:
    | "pending"
    | "complete"
    | "expectation-mismatch"
    | "reference-error"
    | "execution-failed";
  actual?: unknown;
  error?: string;
  expectationMatched?: boolean;
  comparison?: ScenarioComparisonResult;
}
