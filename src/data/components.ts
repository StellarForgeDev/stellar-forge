export interface ComponentCapabilities {
  implemented: boolean;
  sandbox: boolean;
  testnet: boolean;
}

export type ComponentMaturity = "Concept" | "Implemented";

export function componentMaturity(
  component: StellarComponent,
): ComponentMaturity {
  return component.capabilities.implemented ? "Implemented" : "Concept";
}

export type ConfigFieldType = "text" | "number" | "select";

export interface ParameterSpec {
  name: string;
  type: string;
  placeholder?: string;
}

export type FunctionAuthorization = "none" | "admin" | "first-address";

export interface FunctionSpec {
  name: string;
  params: ParameterSpec[];
  returns?: string;
  description?: string;
  authorization?: FunctionAuthorization;
}

export interface ConfigOption {
  label: string;
  value: string;
}

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  default: string;
  min?: number;
  max?: number;
  options?: ConfigOption[];
  disabled?: boolean;
  mono?: boolean;
}

export interface ComponentImplementation {
  language: "rust";
  package: string;
  sourcePath: string;
  buildTarget: string;
}

/// A single call invoked against a dependency contract after it is deployed.
/// `args` may reference identity names or dependency aliases (both resolve to
/// addresses) as well as raw literal values.
export interface DependencyCall {
  fn: string;
  args: string[];
  signer?: string;
}

/// Declares a contract that must be deployed alongside the component so the
/// Playground can exercise it. This is generic: the sandbox-runner provisions
/// whatever dependencies are listed here, with no component-specific branching.
export interface ComponentDependency {
  /// Stable name used to reference the deployed contract (e.g. as an argument).
  alias: string;
  /// Package (component implementation name) of the dependency contract.
  package: string;
  /// Values for the dependency constructor, keyed by parameter name. Values may
  /// reference identity names (e.g. "admin") which resolve to addresses.
  /// Named `constructorArgs` (not `constructor`) to avoid the built-in
  /// `Object.prototype.constructor`.
  constructorArgs?: Record<string, string>;
  /// Calls to run after deployment (e.g. seeding balances) before the component
  /// itself is exercised.
  setup?: DependencyCall[];
}

export interface StellarComponent {
  slug: string;
  name: string;
  description: string;
  category: string;
  /// Presentation/discovery order within the catalog (lower numbers first).
  /// This is intentional product ordering, not a measure of technical
  /// importance, and it is the single source of truth for component ordering
  /// across every listing surface. Spaced (10, 20, 30, ...) so new components
  /// can be slotted in without renumbering everything.
  displayOrder: number;
  capabilities: ComponentCapabilities;
  shortDescription: string;
  overview: string;
  useCases: string[];
  implementation?: ComponentImplementation;
  interface?: FunctionSpec[];
  config?: ConfigField[];
  dependencies?: ComponentDependency[];
  /// Values for the primary component's own constructor, keyed by parameter
  /// name. Values may reference identity names (e.g. "admin", "user1") or a
  /// dependency alias (e.g. "asset"), both of which resolve to addresses, as
  /// well as literal values. This keeps constructor defaults catalog-driven so
  /// the generic execution layer never assumes a Token-shaped "admin" default.
  /// Named `constructorArgs` (not `constructor`) to avoid the built-in
  /// `Object.prototype.constructor`.
  constructorArgs?: Record<string, string>;
  /// Optional opt-in for the homepage "real contract, executed locally" demo.
  /// When present, the generic homepage widget showcases THIS component using
  /// the named read-only method and shows `preview` as the offline fallback.
  /// This keeps component selection catalog-driven instead of embedding a
  /// specific slug inside the generic UI.
  demo?: { method: string; preview: string };
}

const networkConfig: ConfigField = {
  key: "network",
  label: "Network",
  type: "select",
  default: "testnet",
  options: [
    { label: "Stellar Testnet", value: "testnet" },
    { label: "Stellar Futurenet", value: "futurenet" },
  ],
};

function symbolConfig(defaultSymbol: string): ConfigField {
  return {
    key: "symbol",
    label: "Symbol / Asset",
    type: "text",
    default: defaultSymbol,
    mono: true,
  };
}

function decimalsConfig(
  defaults: { decimals: string; disabled?: boolean } = {
    decimals: "7",
  },
): ConfigField {
  return {
    key: "decimals",
    label: "Decimals",
    type: "number",
    default: defaults.decimals,
    min: 0,
    max: 18,
    disabled: defaults.disabled,
    mono: true,
  };
}

export const stellarComponents: StellarComponent[] = [
  {
    slug: "token",
    displayOrder: 10,
    name: "Token",
    description:
      "A standard fungible token contract implementing the SEP-41 Soroban token interface — initialize, mint, transfer, and query balances.",
    category: "Tokens",
    shortDescription: "SEP-41 fungible token contract",
    overview:
      "A standard Soroban fungible token contract implementing the SEP-41 token interface (soroban_sdk::token::TokenInterface). The contract is deployed with an admin, name, symbol, and decimals, and supports admin-controlled minting, authorized transfers, allowances, and burning. Source lives in the contracts workspace and ships with a passing Rust test suite.",
    useCases: [
      "Deploy a token with configurable admin, name, symbol, and decimals",
      "Mint supply as the contract admin",
      "Transfer balances between addresses with authorization",
      "Grant and spend allowances for delegated transfers",
      "Burn tokens held by an address",
    ],
    implementation: {
      language: "rust",
      package: "token",
      sourcePath: "contracts/contracts/token",
      buildTarget: "wasm32v1-none",
    },
    interface: [
      {
        name: "__constructor",
        params: [
          { name: "admin", type: "Address" },
          { name: "decimal", type: "u32" },
          { name: "name", type: "String" },
          { name: "symbol", type: "String" },
        ],
        authorization: "none",
        description:
          "Deploys and initializes the token. Called automatically on deploy.",
      },
      {
        name: "name",
        params: [],
        returns: "String",
        authorization: "none",
        description: "Returns the token name.",
      },
      {
        name: "symbol",
        params: [],
        returns: "String",
        authorization: "none",
        description: "Returns the token symbol.",
      },
      {
        name: "decimals",
        params: [],
        returns: "u32",
        authorization: "none",
        description:
          "Returns the number of decimals used to represent token amounts.",
      },
      {
        name: "balance",
        params: [{ name: "id", type: "Address" }],
        returns: "i128",
        authorization: "none",
        description: "Returns the balance of id, or 0 when unset.",
      },
      {
        name: "transfer",
        params: [
          { name: "from", type: "Address" },
          { name: "to", type: "MuxedAddress" },
          { name: "amount", type: "i128" },
        ],
        authorization: "first-address",
        description:
          "Transfers amount from from to to (an account or muxed address), authorized by from.",
      },
      {
        name: "allowance",
        params: [
          { name: "from", type: "Address" },
          { name: "spender", type: "Address" },
        ],
        returns: "i128",
        authorization: "none",
        description:
          "Returns the amount spender is allowed to transfer out of from's balance.",
      },
      {
        name: "approve",
        params: [
          { name: "from", type: "Address" },
          { name: "spender", type: "Address" },
          { name: "amount", type: "i128" },
          { name: "expiration_ledger", type: "u32" },
        ],
        authorization: "first-address",
        description:
          "Sets the allowance spender may transfer from from's balance until expiration_ledger.",
      },
      {
        name: "transfer_from",
        params: [
          { name: "spender", type: "Address" },
          { name: "from", type: "Address" },
          { name: "to", type: "Address" },
          { name: "amount", type: "i128" },
        ],
        authorization: "first-address",
        description:
          "Transfers amount from from to to, consuming spender's allowance. Authorized by spender.",
      },
      {
        name: "burn",
        params: [
          { name: "from", type: "Address" },
          { name: "amount", type: "i128" },
        ],
        authorization: "first-address",
        description: "Burns amount from from's balance. Authorized by from.",
      },
      {
        name: "burn_from",
        params: [
          { name: "spender", type: "Address" },
          { name: "from", type: "Address" },
          { name: "amount", type: "i128" },
        ],
        authorization: "first-address",
        description:
          "Burns amount from from's balance, consuming spender's allowance. Authorized by spender.",
      },
      {
        name: "mint",
        params: [
          { name: "to", type: "Address" },
          { name: "amount", type: "i128" },
        ],
        authorization: "admin",
        description: "Mints amount to to. Admin-only.",
      },
      {
        name: "set_admin",
        params: [{ name: "new_admin", type: "Address" }],
        authorization: "admin",
        description: "Sets the contract admin to new_admin. Admin-only.",
      },
    ],
    config: [
      {
        key: "name",
        label: "Token name",
        type: "text",
        default: "Forge Token",
      },
      symbolConfig("FORGE"),
      decimalsConfig(),
      networkConfig,
    ],
    capabilities: { implemented: true, sandbox: true, testnet: true },
    demo: { method: "decimals", preview: "7" },
  },

  {
    slug: "payment",
    displayOrder: 20,
    name: "Payment",
    description:
      "A stateless payment primitive that moves a SEP-41 asset from one address to another on behalf of the sender.",
    category: "Payments",
    shortDescription: "Stateless payment primitive",
    overview:
      "Payment is a thin, stateless Soroban contract. It holds no state of its own: a payment is a transfer of a SEP-41 compatible asset (asset) from a sender (from) to a recipient (to), authorized by the sender. The balance movement happens inside the asset contract, which Payment invokes through the standard token interface. The contract ships with a passing Rust test suite that exercises it against a minimal SEP-41 asset, and runs in the local Playground sandbox.",
    useCases: [
      "Move a SEP-41 asset from one address to another",
      "Authorize a payment as the asset sender",
      "Understand how a stateless contract delegates to an asset contract",
    ],
    implementation: {
      language: "rust",
      package: "payment",
      sourcePath: "contracts/contracts/payment",
      buildTarget: "wasm32v1-none",
    },
    interface: [
      {
        name: "__constructor",
        params: [],
        authorization: "none",
        description:
          "Stateless init. Payment stores nothing, so the constructor takes no arguments.",
      },
      {
        name: "pay",
        params: [
          { name: "from", type: "Address" },
          { name: "to", type: "Address" },
          { name: "asset", type: "Address" },
          { name: "amount", type: "i128" },
        ],
        authorization: "first-address",
        description:
          "Transfers amount of asset from from to to, authorized by from. A negative amount is rejected; any failure from the underlying asset transfer propagates unchanged.",
      },
    ],
    config: [
      {
        key: "name",
        label: "Payment name",
        type: "text",
        default: "Payment",
      },
      networkConfig,
    ],
    dependencies: [
      {
        alias: "asset",
        package: "token",
        constructorArgs: {
          admin: "admin",
          decimal: "7",
          name: "Payment Asset",
          symbol: "PAY",
        },
        setup: [
          { fn: "mint", args: ["admin", "1000000"], signer: "admin" },
        ],
      },
    ],
    capabilities: { implemented: true, sandbox: true, testnet: true },
  },

  {
    slug: "allowance",
    displayOrder: 30,
    name: "Allowance",
    description:
      "A delegated spending manager: an owner grants a spender the right to move up to a set amount of a SEP-41 asset, and the spender executes transfers within that limit without the owner signing each one.",
    category: "Payments",
    shortDescription: "Delegated spending manager",
    overview:
      "Allowance is a delegated spending manager for any SEP-41 token. An owner grants a spender an allowance — a spending limit — for a specific asset; the spender then moves tokens from the owner to a recipient, up to the remaining allowance, without the owner authorizing each transfer. The manager is the sole spending authority: when an owner grants or adjusts an allowance it also approves itself on the underlying token, and `transfer_from` pulls using the manager's own address while the manager's per-spender ledger enforces the policy limit. The contract ships with a passing Rust test suite and runs in the local Playground sandbox.",
    useCases: [
      "Grant a spender a capped, revocable allowance of an asset",
      "Let a spender execute transfers within an approved limit",
      "Build higher-level primitives (subscriptions, payroll) on a managed allowance",
    ],
    implementation: {
      language: "rust",
      package: "allowance",
      sourcePath: "contracts/contracts/allowance",
      buildTarget: "wasm32v1-none",
    },
    interface: [
      {
        name: "__constructor",
        params: [],
        authorization: "none",
        description:
          "Stateless init. Allowance stores allowances per (owner, asset, spender), so the constructor takes no arguments.",
      },
      {
        name: "approve",
        params: [
          { name: "owner", type: "Address" },
          { name: "asset", type: "Address" },
          { name: "spender", type: "Address" },
          { name: "amount", type: "i128" },
          { name: "expiration_ledger", type: "u32" },
        ],
        authorization: "first-address",
        description:
          "Grants spender the right to spend amount of asset from owner's balance, replacing any prior allowance. Also approves the manager on the token with a caller-supplied stable expiration_ledger (must be in the future and at most 1,000,000 ledgers ahead so the authorization remains stable between simulation and execution). Authorized by owner.",
      },
      {
        name: "increase_allowance",
        params: [
          { name: "owner", type: "Address" },
          { name: "asset", type: "Address" },
          { name: "spender", type: "Address" },
          { name: "amount", type: "i128" },
          { name: "expiration_ledger", type: "u32" },
        ],
        authorization: "first-address",
        description:
          "Adds amount to the existing allowance for (owner, asset, spender) and re-syncs the token approval with a caller-supplied stable expiration_ledger. Authorized by owner.",
      },
      {
        name: "decrease_allowance",
        params: [
          { name: "owner", type: "Address" },
          { name: "asset", type: "Address" },
          { name: "spender", type: "Address" },
          { name: "amount", type: "i128" },
          { name: "expiration_ledger", type: "u32" },
        ],
        authorization: "first-address",
        description:
          "Subtracts amount from the existing allowance for (owner, asset, spender), never below zero, and re-syncs the token approval with a caller-supplied stable expiration_ledger. Authorized by owner.",
      },
      {
        name: "allowance",
        params: [
          { name: "owner", type: "Address" },
          { name: "asset", type: "Address" },
          { name: "spender", type: "Address" },
        ],
        returns: "i128",
        authorization: "none",
        description:
          "Returns the remaining allowance spender may spend of asset from owner.",
      },
      {
        name: "transfer_from",
        params: [
          { name: "spender", type: "Address" },
          { name: "asset", type: "Address" },
          { name: "from", type: "Address" },
          { name: "to", type: "Address" },
          { name: "amount", type: "i128" },
        ],
        authorization: "first-address",
        description:
          "Spends amount of asset from from to to on behalf of spender, debiting spender's remaining allowance. Authorized by spender.",
      },
    ],
    config: [
      {
        key: "name",
        label: "Allowance name",
        type: "text",
        default: "Allowance",
      },
      networkConfig,
    ],
    dependencies: [
      {
        alias: "asset",
        package: "token",
        constructorArgs: {
          admin: "admin",
          decimal: "7",
          name: "Delegated Asset",
          symbol: "DEL",
        },
        setup: [
          { fn: "mint", args: ["admin", "1000000"], signer: "admin" },
        ],
      },
    ],
    capabilities: { implemented: true, sandbox: true, testnet: true },
  },

  {
    slug: "atomic-swap",
    displayOrder: 40,
    name: "Atomic Swap",
    description:
      "A reusable two-party atomic asset exchange: one party publishes an offer (give X of asset A for Y of asset B) and the other party executes it, atomically moving both assets or reverting.",
    category: "Payments",
    shortDescription: "Two-party atomic asset exchange",
    overview:
      "Atomic Swap is a minimal two-party exchange, not an AMM or order book. An offerer creates an offer declaring how much of one asset they will give for how much of another; the contract records the offer and the offerer pre-approves the contract on the offered asset. A taker executes the offer: the contract atomically pulls the ask asset from the taker (to the offerer) and the offer asset from the offerer (to the taker). Because the pulls happen inside a single contract call, the swap is all-or-nothing — there is no partial state. The contract ships with a passing Rust test suite and runs in the local Playground sandbox.",
    useCases: [
      "Exchange two distinct tokens between two parties atomically",
      "Publish a fixed-rate offer that any counterparty can fill",
      "Cancel an unfilled offer before it is executed",
    ],
    implementation: {
      language: "rust",
      package: "atomic-swap",
      sourcePath: "contracts/contracts/atomic-swap",
      buildTarget: "wasm32v1-none",
    },
    interface: [
      {
        name: "__constructor",
        params: [],
        authorization: "none",
        description:
          "Stateless init. Atomic Swap stores offers per id, so the constructor takes no arguments.",
      },
      {
        name: "create_offer",
        params: [
          { name: "offerer", type: "Address" },
          { name: "offer_asset", type: "Address" },
          { name: "offer_amount", type: "i128" },
          { name: "ask_asset", type: "Address" },
          { name: "ask_amount", type: "i128" },
        ],
        returns: "u64",
        authorization: "first-address",
        description:
          "Publishes an offer: offerer gives offer_amount of offer_asset for ask_amount of ask_asset. Pre-approves the contract on the offered asset. Returns the new offer id. Authorized by offerer.",
      },
      {
        name: "execute",
        params: [
          { name: "entrant", type: "Address" },
          { name: "offer_id", type: "u64" },
        ],
        authorization: "first-address",
        description:
          "Fills offer_id: atomically pulls the ask asset from the entrant to the offerer and the offer asset from the offerer to the entrant, then marks the offer inactive. Authorized by entrant.",
      },
      {
        name: "cancel_offer",
        params: [
          { name: "offerer", type: "Address" },
          { name: "offer_id", type: "u64" },
        ],
        authorization: "first-address",
        description:
          "Cancels an unfilled offer. Only the original offerer may cancel. Authorized by offerer.",
      },
      {
        name: "offer_active",
        params: [{ name: "offer_id", type: "u64" }],
        returns: "bool",
        authorization: "none",
        description:
          "Returns whether offer_id is still active (published, unfilled, and uncancelled).",
      },
    ],
    config: [
      {
        key: "name",
        label: "Atomic Swap name",
        type: "text",
        default: "Atomic Swap",
      },
      networkConfig,
    ],
    dependencies: [
      {
        alias: "offer_asset",
        package: "token",
        constructorArgs: {
          admin: "admin",
          decimal: "7",
          name: "Offer Asset",
          symbol: "OFA",
        },
        setup: [
          { fn: "mint", args: ["admin", "1000000"], signer: "admin" },
        ],
      },
      {
        alias: "ask_asset",
        package: "token",
        constructorArgs: {
          admin: "admin",
          decimal: "7",
          name: "Ask Asset",
          symbol: "ASK",
        },
        setup: [
          { fn: "mint", args: ["user1", "1000000"], signer: "admin" },
        ],
      },
    ],
    capabilities: { implemented: true, sandbox: true, testnet: true },
  },

  {
    slug: "timelock",
    displayOrder: 110,
    name: "Simple Timelock",
    description:
      "A minimal conditional-release lock: an owner escrows an asset for a beneficiary, which the contract releases only after a configured unlock time (ledger timestamp) has been reached.",
    category: "Payments",
    shortDescription: "Time-gated conditional asset release",
    overview:
      "Simple Timelock is a minimal escrow primitive, not a vesting, governance, multisig, or subscription system. An owner locks an asset amount for a beneficiary together with an unlock time (a ledger timestamp in seconds). The asset is pulled into the contract at lock time, so it is genuinely held until release. Release moves the asset to the beneficiary only when the ledger timestamp has reached the unlock time and the beneficiary authorizes the call. It ships with a passing Rust test suite (including legitimate ledger-time advancement) and runs in the local Playground sandbox.",
    useCases: [
      "Release funds to a beneficiary only after a specific time",
      "Escrow an asset without a third-party custodian",
      "Encode a simple time-based unlock condition",
    ],
    implementation: {
      language: "rust",
      package: "timelock",
      sourcePath: "contracts/contracts/timelock",
      buildTarget: "wasm32v1-none",
    },
    interface: [
      {
        name: "__constructor",
        params: [],
        authorization: "none",
        description:
          "Stateless init. Timelock stores locks per id, so the constructor takes no arguments.",
      },
      {
        name: "lock",
        params: [
          { name: "owner", type: "Address" },
          { name: "asset", type: "Address" },
          { name: "amount", type: "i128" },
          { name: "beneficiary", type: "Address" },
          { name: "unlock_time", type: "Timepoint" },
        ],
        returns: "u64",
        authorization: "first-address",
        description:
          "Escrows amount of asset for beneficiary, released no earlier than unlock_time (a ledger timestamp in seconds). The asset is pulled into the contract immediately. Returns the new lock id. Authorized by owner.",
      },
      {
        name: "release",
        params: [{ name: "lock_id", type: "u64" }],
        authorization: "none",
        description:
          "Releases lock_id to its beneficiary. Fails unless the ledger timestamp has reached unlock_time, and requires beneficiary authorization. Marks the lock spent; cannot be released twice.",
      },
      {
        name: "unlock_time",
        params: [{ name: "lock_id", type: "u64" }],
        returns: "Timepoint",
        authorization: "none",
        description:
          "Returns the ledger timestamp at or after which lock_id may be released.",
      },
      {
        name: "is_unlocked",
        params: [{ name: "lock_id", type: "u64" }],
        returns: "bool",
        authorization: "none",
        description:
          "Returns whether lock_id's unlock time has been reached (ledger timestamp >= unlock_time).",
      },
      {
        name: "lock_released",
        params: [{ name: "lock_id", type: "u64" }],
        returns: "bool",
        authorization: "none",
        description: "Returns whether lock_id has already been released.",
      },
    ],
    config: [
      {
        key: "name",
        label: "Simple Timelock name",
        type: "text",
        default: "Simple Timelock",
      },
      networkConfig,
    ],
    dependencies: [
      {
        alias: "asset",
        package: "token",
        constructorArgs: {
          admin: "admin",
          decimal: "7",
          name: "Timelock Asset",
          symbol: "TLA",
        },
        setup: [{ fn: "mint", args: ["admin", "1000000"], signer: "admin" }],
      },
    ],
    capabilities: { implemented: true, sandbox: true, testnet: true },
  },

  {
    slug: "claimable-balance",
    displayOrder: 50,
    name: "Claimable Balance",
    description:
      "A time- and expiry-gated conditional payment: a funder escrows an asset for a specific claimant, who can claim it only after a delay and (optionally) before an expiry. If never claimed, the admin can cancel and refund the funder.",
    category: "Payments",
    shortDescription: "Time-locked, optionally expiring conditional payment",
    overview:
      "Claimable Balance is a conditional-payment primitive built on Soroban. A funder deposits an asset amount for a designated claimant behind two time bounds: a `delay` (a `Duration` added to the current ledger time) before which the balance cannot be claimed, and an optional `expiry` (`Option<Timepoint>`) after which the claim window closes forever. Until claimed, the asset is genuinely held by the contract. The funder authorizes the deposit (first-address authorization), the claimant authorizes the claim, and the admin may cancel an unclaimed balance to refund the funder. It ships with a passing Rust test suite (including legitimate ledger-time advancement) and runs in the local Playground sandbox. The contract exercises the synthetic-only `Duration` and `Option<Timepoint>` parameter types.",
    useCases: [
      "Pay a recipient only after a vesting or cliff delay",
      "Issue a time-limited reward that expires if unclaimed",
      "Escrow a refundable payment the admin can claw back",
    ],
    implementation: {
      language: "rust",
      package: "claimable-balance",
      sourcePath: "contracts/contracts/claimable-balance",
      buildTarget: "wasm32v1-none",
    },
    interface: [
      {
        name: "__constructor",
        params: [
          { name: "admin", type: "Address" },
          { name: "asset", type: "Address" },
        ],
        authorization: "none",
        description:
          "Initializes the contract with an admin (who may cancel balances) and the asset that will be escrowed.",
      },
      {
        name: "deposit",
        params: [
          { name: "funder", type: "Address" },
          { name: "claimant", type: "Address" },
          { name: "amount", type: "i128" },
          { name: "delay", type: "Duration" },
          { name: "expiry", type: "Option<Timepoint>" },
          { name: "expiration_ledger", type: "u32" },
        ],
        returns: "u64",
        authorization: "first-address",
        description:
          "Escrows `amount` of the asset from `funder` for `claimant`. `delay` is a `Duration` added to the current ledger time as the earliest claim time; `expiry` is an optional `Option<Timepoint>` claim deadline. `expiration_ledger` is a caller-supplied stable absolute ledger for the SEP-41 allowance (must be in the future and at most 1,000,000 ledgers ahead). Returns the new balance id. Authorized by `funder`.",
      },
      {
        name: "claim",
        params: [{ name: "balance_id", type: "u64" }],
        authorization: "none",
        description:
          "Transfers the balance to its claimant. Fails if the delay has not elapsed, if the expiry has passed, or if already claimed or cancelled. Requires claimant authorization.",
      },
      {
        name: "cancel",
        params: [{ name: "balance_id", type: "u64" }],
        authorization: "admin",
        description:
          "Refunds an unclaimed, uncancelled balance to its funder and marks it cancelled. Requires admin authorization.",
      },
      {
        name: "balance_of",
        params: [{ name: "balance_id", type: "u64" }],
        returns: "i128",
        authorization: "none",
        description:
          "Returns the remaining escrowed amount for a balance (0 if claimed or cancelled).",
      },
      {
        name: "is_claimable",
        params: [{ name: "balance_id", type: "u64" }],
        returns: "bool",
        authorization: "none",
        description:
          "Returns whether the balance can be claimed now (delay elapsed, not expired, not claimed/cancelled).",
      },
      {
        name: "expiry",
        params: [{ name: "balance_id", type: "u64" }],
        returns: "Option<Timepoint>",
        authorization: "none",
        description: "Returns the optional claim deadline of a balance.",
      },
    ],
    config: [
      {
        key: "name",
        label: "Claimable Balance name",
        type: "text",
        default: "Claimable Balance",
      },
      networkConfig,
    ],
    dependencies: [
      {
        alias: "asset",
        package: "token",
        constructorArgs: {
          admin: "admin",
          decimal: "7",
          name: "Claimable Asset",
          symbol: "CBA",
        },
        setup: [{ fn: "mint", args: ["admin", "1000000"], signer: "admin" }],
      },
    ],
    constructorArgs: {
      admin: "admin",
      asset: "asset",
    },
    capabilities: { implemented: true, sandbox: true, testnet: true },
  },

  {
    slug: "merkle-airdrop",
    displayOrder: 60,
    name: "Merkle Airdrop / Distributor",
    description:
      "A token distributor that stores a Merkle root and lets eligible recipients claim their allocation by presenting a Merkle proof. The admin funds the contract and may rotate the root; each recipient proves entitlement for a specific (index, claimant, amount) leaf.",
    category: "Tokens",
    shortDescription: "Merkle-proof-gated token distributor",
    overview:
      "Merkle Airdrop is a gas-efficient token distributor built on Soroban. Instead of storing every recipient on-chain, the contract stores a single SHA-256 Merkle root. A recipient claims by supplying a proof (a concatenation of 32-byte sibling hashes) that certifies a leaf committing to (index, claimant, amount) under the active root. Leaves use SHA-256 with sorted-pair hashing, so the proof needs only the sibling hashes and the verifier recombines them in a position-independent way. The admin authorizes deposits and root rotations; the claimant authorizes their own claim. Each index can be claimed at most once. It ships with a passing Rust test suite (including genuine multi-level Merkle verification) and runs in the local Playground sandbox. The contract exercises the generic-only `Bytes` parameter type for both the root and the proof.",
    useCases: [
      "Distribute an airdrop to a large allowlist without on-chain storage per recipient",
      "Let recipients claim only their allocation by proving membership",
      "Rotate the distribution set by replacing the Merkle root",
    ],
    implementation: {
      language: "rust",
      package: "merkle-airdrop",
      sourcePath: "contracts/contracts/merkle-airdrop",
      buildTarget: "wasm32v1-none",
    },
    interface: [
      {
        name: "__constructor",
        params: [
          { name: "admin", type: "Address" },
          { name: "asset", type: "Address" },
          { name: "root", type: "Bytes" },
        ],
        authorization: "none",
        description:
          "Initializes the distributor with an admin, the distributed asset, and the initial Merkle root. The root is a 32-byte SHA-256 `Bytes` value.",
      },
      {
        name: "deposit",
        params: [{ name: "amount", type: "i128" }],
        authorization: "admin",
        description:
          "Pulls `amount` of the asset from the admin into the contract. Authorized by the admin. Rejects non-positive amounts.",
      },
      {
        name: "claim",
        params: [
          { name: "index", type: "u32" },
          { name: "claimant", type: "Address" },
          { name: "amount", type: "i128" },
          { name: "proof", type: "Bytes" },
        ],
        authorization: "first-address",
        description:
          "Claims the allocation for `index` on behalf of `claimant` if `proof` certifies (index, claimant, amount) under the stored root. `proof` is a `Bytes` concatenation of 32-byte sibling hashes. Requires claimant authorization, rejects zero/negative amounts, already-claimed indices, and invalid proofs.",
      },
      {
        name: "claimed",
        params: [{ name: "index", type: "u32" }],
        returns: "bool",
        authorization: "none",
        description: "Returns whether `index` has already been claimed.",
      },
      {
        name: "root",
        params: [],
        returns: "Bytes",
        authorization: "none",
        description:
          "Returns the currently active Merkle root as a `Bytes` value.",
      },
      {
        name: "update_root",
        params: [{ name: "new_root", type: "Bytes" }],
        authorization: "admin",
        description:
          "Replaces the active Merkle root. Authorized by the admin. A claim carrying a proof for the previous root is rejected after rotation.",
      },
    ],
    config: [
      {
        key: "name",
        label: "Merkle Airdrop name",
        type: "text",
        default: "Merkle Airdrop",
      },
      networkConfig,
    ],
    dependencies: [
      {
        alias: "asset",
        package: "token",
        constructorArgs: {
          admin: "admin",
          decimal: "7",
          name: "Airdrop Asset",
          symbol: "AIR",
        },
        setup: [{ fn: "mint", args: ["admin", "1000000"], signer: "admin" }],
      },
    ],
    constructorArgs: {
      admin: "admin",
      asset: "asset",
      root: "0000000000000000000000000000000000000000000000000000000000000000",
    },
    capabilities: { implemented: true, sandbox: true, testnet: true },
  },

  {
    slug: "oracle",
    displayOrder: 65,
    name: "Oracle / Signed Price Feed",
    description:
      "An on-chain price oracle that accepts signed price observations from a single authorized Ed25519 signer. The admin deploys the feed with the signer's public key and a symbol; anyone can submit a (price, timestamp, signature) tuple, and the contract verifies the Ed25519 signature before accepting the value. The latest accepted price and its timestamp are readable on-chain.",
    category: "Tokens",
    shortDescription: "Ed25519-signed on-chain price feed",
    overview:
      "Oracle is a minimal, dependency-free price feed built on Soroban. It stores a single authorized Ed25519 public key (32-byte `Bytes`) and a feed symbol. A publisher submits a price together with a unix timestamp and an Ed25519 signature over the canonical message `ORACLE-V1 || price || timestamp`. The contract verifies the signature using the host's `ed25519_verify` before storing the value, so a forged or replayed observation is rejected. Prices must be published with strictly increasing timestamps to prevent replay. The admin can rotate the signer key. The contract genuinely exercises the `i64`, `Timepoint`, `Symbol`, and `Bytes` parameter types, and performs real cryptographic signature verification rather than simulating it. It ships with a passing Rust test suite (including genuine Ed25519 round-trips and rejection cases) and runs in the local Playground sandbox.",
    useCases: [
      "Publish a signed price feed that off-chain signers push on a schedule",
      "Let dApps read the latest trusted price without trusting the submitter",
      "Rotate the authorized signer without redeploying the contract",
    ],
    implementation: {
      language: "rust",
      package: "oracle",
      sourcePath: "contracts/contracts/oracle",
      buildTarget: "wasm32v1-none",
    },
    interface: [
      {
        name: "__constructor",
        params: [
          { name: "admin", type: "Address" },
          { name: "signer", type: "Bytes" },
          { name: "symbol", type: "Symbol" },
        ],
        authorization: "none",
        description:
          "Initializes the oracle with an admin, the authorized Ed25519 public key (32-byte `Bytes`), and the feed symbol.",
      },
      {
        name: "publish",
        params: [
          { name: "price", type: "i64" },
          { name: "timestamp", type: "Timepoint" },
          { name: "signature", type: "Bytes" },
        ],
        returns: "bool",
        authorization: "none",
        description:
          "Verifies the Ed25519 signature over `ORACLE-V1 || price || timestamp` and, if valid and the timestamp is strictly greater than the last, stores the price and returns true. An invalid signature fails the invocation; a non-increasing timestamp returns false.",
      },
      {
        name: "latest_price",
        params: [],
        returns: "i64",
        authorization: "none",
        description: "Returns the most recently published price.",
      },
      {
        name: "latest_time",
        params: [],
        returns: "Timepoint",
        authorization: "none",
        description:
          "Returns the unix timestamp of the most recently published price.",
      },
      {
        name: "set_signer",
        params: [{ name: "new_signer", type: "Bytes" }],
        authorization: "admin",
        description:
          "Rotates the authorized Ed25519 public key. Authorized only by the admin.",
      },
    ],
    config: [
      {
        key: "name",
        label: "Oracle name",
        type: "text",
        default: "Oracle",
      },
      networkConfig,
    ],
    constructorArgs: {
      admin: "admin",
      signer: "4242424242424242424242424242424242424242424242424242424242424242",
      symbol: "USD",
    },
    capabilities: { implemented: true, sandbox: true, testnet: true },
  },

  {
    slug: "crowdfund",
    displayOrder: 90,
    name: "Simple Crowdfund",
    description:
      "A minimal fixed-deadline crowdfunding campaign: an owner sets a funding goal and deadline in a SEP-41 asset; contributors fund it; after the deadline the owner withdraws on success or each contributor reclaims on failure.",
    category: "Payments",
    shortDescription: "Fixed-deadline funding campaign",
    overview:
      "Simple Crowdfund is a minimal funding primitive, not a DAO, governance system, token issuer, AMM, or multi-round platform. An owner creates a campaign with a goal and a deadline (a ledger timestamp). Contributors send the asset to the contract before the deadline. After the deadline, if the goal was reached only the owner may withdraw the full balance; if it was not reached, each contributor may claim a refund of exactly their own contribution. Funds are always resolvable — there is no path that permanently locks the held balance. It ships with a passing Rust test suite (including legitimate ledger-time advancement) and runs in the local Playground sandbox.",
    useCases: [
      "Run a fixed-deadline fundraising campaign in a single asset",
      "Let contributors reclaim funds when a campaign misses its goal",
      "Release collected funds to the creator only after success",
    ],
    implementation: {
      language: "rust",
      package: "crowdfund",
      sourcePath: "contracts/contracts/crowdfund",
      buildTarget: "wasm32v1-none",
    },
    interface: [
      {
        name: "__constructor",
        params: [],
        authorization: "none",
        description:
          "Stateless init. Crowdfund stores campaigns per id, so the constructor takes no arguments.",
      },
      {
        name: "create_campaign",
        params: [
          { name: "owner", type: "Address" },
          { name: "asset", type: "Address" },
          { name: "goal", type: "i128" },
          { name: "deadline", type: "u64" },
        ],
        returns: "u64",
        authorization: "first-address",
        description:
          "Creates a campaign owned by owner, collecting asset, targeting goal, closing at deadline (a ledger timestamp). Returns the new campaign id. Authorized by owner.",
      },
      {
        name: "contribute",
        params: [
          { name: "campaign_id", type: "u64" },
          { name: "contributor", type: "Address" },
          { name: "amount", type: "i128" },
          { name: "expiration_ledger", type: "u32" },
        ],
        authorization: "first-address",
        description:
          "Contributes amount of the campaign's asset from contributor before the deadline. Pulls the asset into the contract and tracks the contributor's cumulative amount. Caller must supply a stable expiration_ledger (absolute ledger, must be in the future and at most 1,000,000 ledgers ahead) so the token allowance authorization remains stable between simulation and execution. Authorized by contributor.",
      },
      {
        name: "withdraw",
        params: [
          { name: "campaign_id", type: "u64" },
          { name: "owner", type: "Address" },
        ],
        authorization: "first-address",
        description:
          "Withdraws the full balance to the owner after the deadline, but only if the goal was reached. Single-use and owner-only. Authorized by owner.",
      },
      {
        name: "claim_refund",
        params: [
          { name: "campaign_id", type: "u64" },
          { name: "contributor", type: "Address" },
        ],
        authorization: "first-address",
        description:
          "Claims a refund of the caller's own contribution after the deadline, but only if the goal was not reached. Single-use. Authorized by contributor.",
      },
      {
        name: "contributors",
        params: [{ name: "campaign_id", type: "u64" }],
        returns: "Vec<Address>",
        authorization: "none",
        description:
          "Returns the addresses that have contributed a positive amount to campaign_id.",
      },
      {
        name: "contribution_of",
        params: [
          { name: "campaign_id", type: "u64" },
          { name: "contributor", type: "Address" },
        ],
        returns: "i128",
        authorization: "none",
        description: "Returns contributor's contribution to campaign_id (0 if none).",
      },
      {
        name: "contributions",
        params: [{ name: "campaign_id", type: "u64" }],
        returns: "Map<Address, i128>",
        authorization: "none",
        description:
          "Returns the non-zero contributions to campaign_id, keyed by contributor.",
      },
      {
        name: "total_raised",
        params: [{ name: "campaign_id", type: "u64" }],
        returns: "i128",
        authorization: "none",
        description: "Returns the total amount contributed to campaign_id.",
      },
      {
        name: "goal_reached",
        params: [{ name: "campaign_id", type: "u64" }],
        returns: "bool",
        authorization: "none",
        description: "Returns whether campaign_id's goal has been reached.",
      },
    ],
    config: [
      {
        key: "name",
        label: "Simple Crowdfund name",
        type: "text",
        default: "Simple Crowdfund",
      },
      networkConfig,
    ],
    dependencies: [
      {
        alias: "asset",
        package: "token",
        constructorArgs: {
          admin: "admin",
          decimal: "7",
          name: "Crowdfund Asset",
          symbol: "CFA",
        },
        setup: [{ fn: "mint", args: ["admin", "1000000"], signer: "admin" }],
      },
    ],
    capabilities: { implemented: true, sandbox: true, testnet: true },
  },

  {
    slug: "access-control",
    displayOrder: 130,
    name: "Access Control",
    description:
      "A minimal role-based authorization contract: a single admin grants and revokes roles, and transfers administration.",
    category: "Security",
    shortDescription: "Role-based admin authorization",
    overview:
      "Access Control is a small, stateful Soroban contract that centralizes authorization behind a single admin identity. The admin grants or revokes (role, account) pairs and can transfer administration to a new address. Read-only queries let any caller check whether an account holds a role. It ships with a passing Rust test suite and runs in the local Playground sandbox.",
    useCases: [
      "Gate contract operations behind an admin-controlled role",
      "Grant and revoke roles for specific accounts",
      "Transfer administrative control to a new address",
      "Query role membership without authorization",
    ],
    implementation: {
      language: "rust",
      package: "access-control",
      sourcePath: "contracts/contracts/access-control",
      buildTarget: "wasm32v1-none",
    },
    interface: [
      {
        name: "__constructor",
        params: [{ name: "admin", type: "Address" }],
        authorization: "none",
        description:
          "Initializes the contract with a single admin. Called automatically on deploy.",
      },
      {
        name: "grant_role",
        params: [
          { name: "role", type: "Symbol" },
          { name: "account", type: "Address" },
        ],
        authorization: "admin",
        description: "Grants role to account. Admin-only.",
      },
      {
        name: "revoke_role",
        params: [
          { name: "role", type: "Symbol" },
          { name: "account", type: "Address" },
        ],
        authorization: "admin",
        description: "Revokes role from account. Admin-only.",
      },
      {
        name: "has_role",
        params: [
          { name: "role", type: "Symbol" },
          { name: "account", type: "Address" },
        ],
        returns: "bool",
        authorization: "none",
        description: "Returns whether account currently holds role.",
      },
      {
        name: "transfer_admin",
        params: [{ name: "new_admin", type: "Address" }],
        authorization: "admin",
        description: "Transfers administration to new_admin. Admin-only.",
      },
    ],
    config: [
      {
        key: "name",
        label: "Access Control name",
        type: "text",
        default: "Access Control",
      },
      networkConfig,
    ],
    constructorArgs: {
      admin: "admin",
    },
    capabilities: { implemented: true, sandbox: true, testnet: true },
  },

  {
    slug: "escrow",
    displayOrder: 120,
    name: "Escrow",
    description:
      "Holds a SEP-41 asset between a depositor and beneficiary until the arbiter releases or refunds it.",
    category: "Payments",
    shortDescription: "Conditional asset release",
    overview:
      "Escrow is a small, stateful Soroban contract that locks a SEP-41 asset (the `asset` dependency) between a `depositor` and a `beneficiary`. Only the `arbiter` can move the held funds: `release` sends them to the beneficiary, `refund` returns them to the depositor. The asset itself lives in a separate SEP-41 contract — Escrow delegates the actual balance movement to it, just like the Payment primitive. The contract ships with a passing Rust test suite and runs in the local Playground sandbox.",
    useCases: [
      "Hold a SEP-41 asset between two parties",
      "Release funds to the beneficiary via an arbiter",
      "Refund funds to the depositor via an arbiter",
      "Explore conditional, role-based payment workflows",
    ],
    implementation: {
      language: "rust",
      package: "escrow",
      sourcePath: "contracts/contracts/escrow",
      buildTarget: "wasm32v1-none",
    },
    interface: [
      {
        name: "__constructor",
        params: [
          { name: "depositor", type: "Address" },
          { name: "beneficiary", type: "Address" },
          { name: "arbiter", type: "Address" },
          { name: "asset", type: "Address" },
        ],
        authorization: "none",
        description:
          "Locks the escrow to a depositor, beneficiary, and arbiter, holding the given SEP-41 asset.",
      },
      {
        name: "deposit",
        params: [
          { name: "depositor", type: "Address" },
          { name: "amount", type: "i128" },
        ],
        authorization: "first-address",
        description:
          "Moves `amount` of the held asset from the depositor into the contract. Authorized by the depositor.",
      },
      {
        name: "release",
        params: [{ name: "arbiter", type: "Address" }],
        authorization: "first-address",
        description:
          "Releases the held asset to the beneficiary. Authorized by the arbiter.",
      },
      {
        name: "refund",
        params: [{ name: "arbiter", type: "Address" }],
        authorization: "first-address",
        description:
          "Returns the held asset to the depositor. Authorized by the arbiter.",
      },
      {
        name: "status",
        params: [],
        returns: "u32",
        authorization: "none",
        description:
          "Returns the escrow state: 0 = active, 1 = released, 2 = refunded.",
      },
    ],
    config: [
      {
        key: "name",
        label: "Escrow name",
        type: "text",
        default: "Escrow",
      },
      networkConfig,
    ],
    constructorArgs: {
      depositor: "user1",
      beneficiary: "user2",
      arbiter: "admin",
      asset: "asset",
    },
    dependencies: [
      {
        alias: "asset",
        package: "token",
        constructorArgs: {
          admin: "admin",
          decimal: "7",
          name: "Escrow Asset",
          symbol: "EAC",
        },
        setup: [
          { fn: "mint", args: ["admin", "1000000"], signer: "admin" },
        ],
      },
    ],
    capabilities: { implemented: true, sandbox: true, testnet: true },
  },

  {
    slug: "multi-signature",
    displayOrder: 140,
    name: "Multi-signature",
    description:
      "Requires multiple approving signers before a proposal executes.",
    category: "Security",
    shortDescription: "Multiple signer approval",
    overview:
      "Multi-signature is a minimal M-of-N approval component. Three signers are configured at construction together with a threshold. Each signer may approve a proposal (by its Symbol id) once; approvals are idempotent per signer. A proposal may be executed once its distinct approval count reaches the threshold. The contract ships with a passing Rust test suite and runs in the local Playground sandbox.",
    useCases: [
      "Require multiple approvals before an action",
      "Model shared-control workflows",
      "Explore multi-party transaction authorization",
    ],
    implementation: {
      language: "rust",
      package: "multi-signature",
      sourcePath: "contracts/contracts/multi-signature",
      buildTarget: "wasm32v1-none",
    },
    interface: [
      {
        name: "__constructor",
        params: [
          { name: "signer1", type: "Address" },
          { name: "signer2", type: "Address" },
          { name: "signer3", type: "Address" },
          { name: "threshold", type: "u32" },
        ],
        authorization: "none",
        description:
          "Configures the three authorized signers and the M-of-N threshold. Called automatically on deploy.",
      },
      {
        name: "approve",
        params: [
          { name: "signer", type: "Address" },
          { name: "proposal_id", type: "Symbol" },
        ],
        authorization: "first-address",
        description:
          "Records an approval from `signer` for `proposal_id`. Idempotent per signer. Only authorized signers may approve.",
      },
      {
        name: "execute",
        params: [{ name: "proposal_id", type: "Symbol" }],
        authorization: "none",
        description:
          "Executes `proposal_id` once its approvals meet the threshold. Returns whether execution occurred.",
      },
      {
        name: "is_approved",
        params: [{ name: "proposal_id", type: "Symbol" }],
        returns: "bool",
        authorization: "none",
        description:
          "Returns whether `proposal_id` has reached the approval threshold.",
      },
    ],
    config: [
      {
        key: "name",
        label: "Multi-signature name",
        type: "text",
        default: "Multi-Signature",
      },
      networkConfig,
    ],
    constructorArgs: {
      signer1: "signer1",
      signer2: "signer2",
      signer3: "signer3",
      threshold: "2",
    },
    capabilities: { implemented: true, sandbox: true, testnet: true },
  },

  {
    slug: "subscription",
    displayOrder: 80,
    name: "Subscription",
    description:
      "A recurring-payment agreement that charges a subscriber on a fixed interval.",
    category: "Payments",
    shortDescription: "Recurring payment agreement",
    overview:
      "Subscription is a minimal recurring-payment component. A subscriber, a merchant, the subscribed asset, a fixed amount, and a charge interval (in seconds) are configured at construction. Each charge transfers the amount from the subscriber to the merchant once the ledger time reaches the contract's internal next-charge Timepoint, then advances the schedule. Time stays internal contract state, so the component fits the generic catalog pipeline with no time-specific parameter type. It ships with a passing Rust test suite and runs in the local Playground sandbox.",
    useCases: [
      "Model recurring payments",
      "Require the subscriber's authorization to charge",
      "Explore time-driven state without a time parameter type",
    ],
    implementation: {
      language: "rust",
      package: "subscription",
      sourcePath: "contracts/contracts/subscription",
      buildTarget: "wasm32v1-none",
    },
    interface: [
      {
        name: "__constructor",
        params: [
          { name: "subscriber", type: "Address" },
          { name: "merchant", type: "Address" },
          { name: "asset", type: "Address" },
          { name: "amount", type: "i128" },
          { name: "interval", type: "u32" },
        ],
        authorization: "none",
        description:
          "Configures the subscriber, merchant, subscribed asset, payment amount, and charge interval in seconds. Called automatically on deploy.",
      },
      {
        name: "charge",
        params: [{ name: "subscriber", type: "Address" }],
        authorization: "first-address",
        description:
          "Transfers `amount` of `asset` from the subscriber to the merchant if the subscription is active and the next charge time has been reached. Returns whether a charge occurred.",
      },
      {
        name: "cancel",
        params: [{ name: "subscriber", type: "Address" }],
        authorization: "first-address",
        description:
          "Cancels the subscription. Only the subscriber may cancel. Returns whether cancellation occurred.",
      },
      {
        name: "is_active",
        params: [],
        returns: "bool",
        authorization: "none",
        description:
          "Returns whether the subscription is still active.",
      },
    ],
    dependencies: [
      {
        alias: "asset",
        package: "token",
        constructorArgs: {
          admin: "admin",
          decimal: "7",
          name: "Subscription Asset",
          symbol: "SUB",
        },
        setup: [
          { fn: "mint", args: ["admin", "1000000"], signer: "admin" },
        ],
      },
    ],
    config: [
      {
        key: "name",
        label: "Subscription name",
        type: "text",
        default: "Subscription",
      },
      networkConfig,
    ],
    constructorArgs: {
      subscriber: "subscriber",
      merchant: "merchant",
      asset: "asset",
      amount: "1000",
      interval: "3600",
    },
    capabilities: { implemented: true, sandbox: true, testnet: true },
  },
  {
    slug: "vesting",
    displayOrder: 70,
    name: "Vesting",
    category: "Tokens",
    description:
      "Custodies a SEP-41 token on behalf of a single beneficiary and releases it linearly over a time window that begins a configurable offset after deployment, after an initial cliff, across a total duration. Useful for token grants, founder unlocks, and scheduled payouts. Fits the generic pipeline: time stays internal contract state, the asset is a flat token dependency, and the beneficiary is the first Address constructor argument, so no component-specific code is required. The contract is funded via a `deposit` call (authorized by the sender) before claims begin.",
    shortDescription: "Time-locked token vesting",
    overview:
      "Vesting is a small, stateful Soroban contract. It custodies a SEP-41 asset on behalf of a single beneficiary and releases the balance linearly over a schedule defined by a start offset, a cliff, and a duration — all relative to deployment time. The asset lives in a separate SEP-41 contract; Vesting delegates balance movement to it, exactly like the Escrow and Payment components. It ships with a passing Rust test suite and runs in the local Playground sandbox.",
    useCases: [
      "Release tokens to a beneficiary on a linear vesting schedule",
      "Enforce a cliff before any amount becomes claimable",
      "Model token grants, founder unlocks, or scheduled payouts",
      "Query the currently claimable and already-released amounts",
    ],
    implementation: {
      language: "rust",
      package: "vesting",
      sourcePath: "contracts/contracts/vesting",
      buildTarget: "wasm32v1-none",
    },
    interface: [
      {
        name: "__constructor",
        params: [
          { name: "beneficiary", type: "Address" },
          { name: "asset", type: "Address" },
          { name: "total", type: "i128" },
          { name: "start", type: "u32" },
          { name: "duration", type: "u32" },
          { name: "cliff", type: "u32" },
        ],
        authorization: "none",
        description:
          "Configures the vesting schedule. `start`, `duration`, and `cliff` are seconds; `start` is relative to deployment, while `cliff` and `duration` are relative to `start`.",
      },
      {
        name: "deposit",
        params: [
          { name: "from", type: "Address" },
          { name: "amount", type: "i128" },
        ],
        authorization: "first-address",
        description:
          "Funds the contract by moving `amount` of the held asset from `from` into the contract. Authorized by `from`.",
      },
      {
        name: "claim",
        params: [{ name: "beneficiary", type: "Address" }],
        authorization: "first-address",
        returns: "i128",
        description:
          "Releases the currently vested (and unclaimed) amount to the beneficiary. Authorized by the beneficiary. Returns the amount transferred; returns 0 before the cliff or when nothing is vested.",
      },
      {
        name: "claimable",
        params: [],
        authorization: "none",
        returns: "i128",
        description:
          "Reports the amount currently vested and not yet claimed, based on the ledger time.",
      },
      {
        name: "released",
        params: [],
        authorization: "none",
        returns: "i128",
        description:
          "Reports the total amount already claimed by the beneficiary.",
      },
    ],
    config: [
      {
        key: "name",
        label: "Vesting name",
        type: "text",
        default: "Vesting",
      },
      networkConfig,
    ],
    capabilities: { implemented: true, sandbox: true, testnet: true },
    dependencies: [
      {
        alias: "asset",
        package: "token",
        constructorArgs: {
          admin: "admin",
          decimal: "7",
          name: "Vesting Asset",
          symbol: "VEST",
        },
        setup: [
          { fn: "mint", args: ["admin", "1000000"], signer: "admin" },
        ],
      },
    ],
    constructorArgs: {
      beneficiary: "beneficiary",
      asset: "asset",
      total: "1000000",
      start: "0",
      duration: "86400",
      cliff: "3600",
    },
  },

  {
    slug: "staking",
    displayOrder: 100,
    name: "Staking",
    category: "Tokens",
    description:
      "A minimal single-asset staking contract: stakers deposit a SEP-41 asset, accrue rewards over time at a fixed rate funded by an admin, and claim them. Rewards are proportional to each staker's share of the pool and to the time staked.",
    shortDescription: "Single-asset staking with time-based rewards",
    overview:
      "Staking is a small, stateful Soroban contract built around a single SEP-41 asset that is both staked and rewarded. An admin funds a reward pool through `fund_rewards`; from then on every staker accrues rewards continuously at a fixed rate (funded amount / duration) using the standard reward-per-token accounting, so earnings are proportional to stake size and to the time staked. Stakers `stake` and `unstake` the asset and `claim` accrued rewards; the contract holds the staked balances and the reward reserve and delegates all balance movement to the asset contract. It ships with a passing Rust test suite and runs in the local Playground sandbox.",
    useCases: [
      "Stake a token to earn a time-based reward yield",
      "Fund a reward pool and let stakers accrue proportionally",
      "Unstake partially or fully while keeping accrued rewards",
      "Claim rewards independently of unstaking",
    ],
    implementation: {
      language: "rust",
      package: "staking",
      sourcePath: "contracts/contracts/staking",
      buildTarget: "wasm32v1-none",
    },
    interface: [
      {
        name: "__constructor",
        params: [
          { name: "asset", type: "Address" },
          { name: "duration", type: "u32" },
        ],
        authorization: "none",
        description:
          "Configures the staking pool with the SEP-41 `asset` and a reward-window `duration` in seconds. Called automatically on deploy.",
      },
      {
        name: "fund_rewards",
        params: [
          { name: "from", type: "Address" },
          { name: "amount", type: "i128" },
        ],
        authorization: "admin",
        description:
          "Transfers `amount` of the asset from `from` into the reward pool and (re)starts a reward period of `duration` seconds. Admin-only.",
      },
      {
        name: "stake",
        params: [
          { name: "from", type: "Address" },
          { name: "amount", type: "i128" },
        ],
        authorization: "first-address",
        description:
          "Stakes `amount` of the asset from `from`. Authorized by `from`. Increases the staker's balance and the pool total.",
      },
      {
        name: "unstake",
        params: [
          { name: "from", type: "Address" },
          { name: "amount", type: "i128" },
        ],
        authorization: "first-address",
        description:
          "Claims any pending rewards for `from`, then returns up to `amount` of the staked asset to `from`. Authorized by `from`.",
      },
      {
        name: "claim",
        params: [{ name: "from", type: "Address" }],
        returns: "i128",
        authorization: "first-address",
        description:
          "Claims and transfers the rewards accrued to `from`. Authorized by `from`. Returns the amount transferred.",
      },
      {
        name: "staked_balance",
        params: [{ name: "of", type: "Address" }],
        returns: "i128",
        authorization: "none",
        description: "Returns the staked balance of `of`.",
      },
      {
        name: "earned",
        params: [{ name: "of", type: "Address" }],
        returns: "i128",
        authorization: "none",
        description:
          "Returns the rewards accrued to `of` but not yet claimed.",
      },
      {
        name: "total_staked",
        params: [],
        returns: "i128",
        authorization: "none",
        description: "Returns the total amount currently staked in the pool.",
      },
      {
        name: "reward_rate",
        params: [],
        returns: "i128",
        authorization: "none",
        description:
          "Returns the current reward rate (reward tokens per second).",
      },
    ],
    config: [
      {
        key: "name",
        label: "Staking name",
        type: "text",
        default: "Staking",
      },
      networkConfig,
    ],
    dependencies: [
      {
        alias: "asset",
        package: "token",
        constructorArgs: {
          admin: "admin",
          decimal: "7",
          name: "Staking Asset",
          symbol: "STAKE",
        },
        setup: [
          { fn: "mint", args: ["admin", "1000000"], signer: "admin" },
        ],
      },
    ],
    constructorArgs: {
      asset: "asset",
      duration: "86400",
    },
    capabilities: { implemented: true, sandbox: true, testnet: true },
  },
];

/// Returns a new array sorted by the catalog's canonical presentation order.
/// Order: displayOrder (ascending) -> name -> slug, the latter two being a
/// deterministic, component-agnostic tiebreaker. The input array is never
/// mutated, so callers may sort the live catalog safely.
export function orderComponents(
  components: StellarComponent[],
): StellarComponent[] {
  return [...components].sort((a, b) => {
    const diff = (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
    if (diff !== 0) return diff;
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.slug.localeCompare(b.slug);
  });
}

/// Category filter options derived from the catalog itself. "All" is always
/// first; the remaining categories are ordered by the lowest displayOrder of
/// their member components (so the category bar follows the product hierarchy)
/// with a deterministic name tiebreaker. No separate hardcoded list is required.
export const componentCategories: string[] = (() => {
  const categoryOrder = new Map<string, number>();
  for (const component of stellarComponents) {
    const order = component.displayOrder ?? 0;
    const current = categoryOrder.get(component.category);
    if (current === undefined || order < current) {
      categoryOrder.set(component.category, order);
    }
  }
  const categories = [...categoryOrder.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([category]) => category);
  return ["All", ...categories];
})();

export function getComponentBySlug(slug: string) {
  return stellarComponents.find((component) => component.slug === slug);
}

export function getComponentByPackage(pkg: string) {
  return stellarComponents.find(
    (component) => component.implementation?.package === pkg,
  );
}

export function getConfigDefaults(
  component: StellarComponent,
): Record<string, string> {
  return Object.fromEntries(
    (component.config ?? []).map((field) => [field.key, field.default]),
  );
}

export function componentWasmPath(
  component: StellarComponent,
): string | null {
  const implementation = component.implementation;
  if (!implementation) return null;
  const packageName = implementation.package.replace(/-/g, "_");
  return `contracts/target/${implementation.buildTarget}/release/${packageName}.wasm`;
}
