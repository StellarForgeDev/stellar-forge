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
  },

  {
    slug: "payment",
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
    slug: "access-control",
    name: "Access Control",
    description:
      "Role- and permission-based access checks for a Soroban contract.",
    category: "Security",
    shortDescription: "Role and permission checks",
    overview:
      "A reusable authorization pattern for controlling which addresses can perform specific contract operations.",
    useCases: [
      "Restrict contract operations",
      "Define role-based permissions",
      "Understand authorization patterns in Soroban",
    ],
    config: [
      {
        key: "name",
        label: "Role name",
        type: "text",
        default: "Admin",
      },
      symbolConfig("ADMIN"),
      decimalsConfig({ decimals: "0", disabled: true }),
      networkConfig,
    ],
    capabilities: { implemented: false, sandbox: false, testnet: false },
  },

  {
    slug: "escrow",
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
    capabilities: { implemented: true, sandbox: true, testnet: false },
  },

  {
    slug: "subscription",
    name: "Subscription",
    description:
      "A recurring-payment pattern for periodic, agreed-upon transfers.",
    category: "Payments",
    shortDescription: "Recurring payment pattern",
    overview:
      "A reusable pattern for representing recurring payments between an authorized payer and a service or recipient.",
    useCases: [
      "Model recurring payments",
      "Define payment intervals",
      "Explore automated payment workflows",
    ],
    config: [
      {
        key: "name",
        label: "Plan name",
        type: "text",
        default: "Subscription",
      },
      symbolConfig("XLM"),
      decimalsConfig(),
      networkConfig,
    ],
    capabilities: { implemented: false, sandbox: false, testnet: false },
  },

  {
    slug: "multi-signature",
    name: "Multi-signature",
    description:
      "Requires multiple approving signers before a transaction executes.",
    category: "Security",
    shortDescription: "Multiple signer approval",
    overview:
      "A security pattern that requires multiple authorized parties to approve an operation before it can execute.",
    useCases: [
      "Require multiple approvals",
      "Build shared-control workflows",
      "Explore multi-party transaction authorization",
    ],
    config: [
      {
        key: "name",
        label: "Configuration name",
        type: "text",
        default: "Multi-Signature",
      },
      {
        key: "symbol",
        label: "Required signers",
        type: "text",
        default: "XLM",
      },
      decimalsConfig({ decimals: "7", disabled: true }),
      networkConfig,
    ],
    capabilities: { implemented: false, sandbox: false, testnet: false },
  },
];

export const componentCategories = [
  "All",
  "Tokens",
  "Payments",
  "Security",
] as const;

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