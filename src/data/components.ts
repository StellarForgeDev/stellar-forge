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
      "A minimal pattern for building and submitting a Stellar payment.",
    category: "Payments",
    shortDescription: "Stellar payment pattern",
    overview:
      "A simple pattern for working with Stellar payments and understanding the structure behind a payment flow.",
    useCases: [
      "Build a basic Stellar payment flow",
      "Understand payment transaction structure",
      "Adapt the pattern for application-specific payments",
    ],
    config: [
      {
        key: "name",
        label: "Payment name",
        type: "text",
        default: "Payment",
      },
      symbolConfig("XLM"),
      decimalsConfig(),
      networkConfig,
    ],
    capabilities: { implemented: false, sandbox: false, testnet: false },
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
      "Holds funds until a defined condition or set of signers releases them.",
    category: "Payments",
    shortDescription: "Conditional fund release",
    overview:
      "A pattern for holding funds under defined conditions before allowing them to be released to the intended parties.",
    useCases: [
      "Hold funds between multiple parties",
      "Release funds after defined conditions",
      "Explore conditional payment workflows",
    ],
    config: [
      {
        key: "name",
        label: "Escrow name",
        type: "text",
        default: "Escrow",
      },
      symbolConfig("XLM"),
      decimalsConfig(),
      networkConfig,
    ],
    capabilities: { implemented: false, sandbox: false, testnet: false },
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