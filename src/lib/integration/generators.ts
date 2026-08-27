import type { ParameterSpec } from "@/data/components";
import { componentMaturity } from "@/data/components";
import type {
  IntegrationContext,
  IntegrationLanguage,
} from "@/lib/integration/types";

const SOROBAN_SDK_VERSION = "27";

export function generateIntegrationCode(
  context: IntegrationContext,
  language: IntegrationLanguage,
): string | null {
  switch (language) {
    case "rust":
      return generateRustIntegration(context);
    case "typescript":
      return generateTypescriptIntegration(context);
  }
}

export function generateRustIntegration({
  component,
  configValues,
}: IntegrationContext): string | null {
  const interfaceFns = component.interface ?? [];
  const implementation = component.implementation;
  if (!implementation || interfaceFns.length === 0) {
    return null;
  }

  const constructor = interfaceFns.find((fn) => fn.name === "__constructor");
  const callableFns = interfaceFns.filter((fn) => fn.name !== "__constructor");
  const dependencies = component.dependencies ?? [];
  const dependencyAliases = new Set(dependencies.map((dependency) => dependency.alias));
  const constructorArgs = component.constructorArgs ?? {};
  const packageName = implementation.package;
  const packageIdentifier = snakeCase(packageName);
  const clientName = `${pascalCase(packageName)}Client`;
  const clientVar = snakeCase(clientName);

  const paramTypes = new Set(
    interfaceFns.flatMap((fn) => fn.params.map((param) => param.type)),
  );
  const sdkImports = [
    "Address",
    "Bytes",
    "Env",
    ...(paramTypes.has("String") ? ["String"] : []),
    ...(paramTypes.has("Symbol") ? ["Symbol"] : []),
    ...(paramTypes.has("MuxedAddress") ? ["MuxedAddress"] : []),
  ];

  const lines: string[] = [];

  const rule = "=".repeat(76);
  lines.push(`// ${rule}`);
  lines.push(
    `// Stellar-Forge · integration example · ${component.name} · Rust`,
  );
  lines.push(`// ${rule}`);

  const metadata: Array<[string, string]> = [
    ["Component", component.name],
    ["Slug", component.slug],
    ["Category", component.category],
    ["Status", componentMaturity(component)],
    ["Package", packageName],
    ["Source", implementation.sourcePath],
    ["Build target", implementation.buildTarget],
  ];
  const labelWidth = Math.max(...metadata.map(([label]) => label.length));
  for (const [label, value] of metadata) {
    lines.push(`// ${label.padEnd(labelWidth)} : ${value}`);
  }

  lines.push("//");
  lines.push("// Configuration:");
  for (const field of component.config ?? []) {
    const value = configValues[field.key] ?? field.default;
    lines.push(
      `//   ${field.key.padEnd(10)} = ${value}    // ${field.label}`,
    );
  }

  lines.push("//");
  lines.push(
    `// Generated from the catalog interface — a starting point for`,
    `// integration work, not a complete SDK. Signatures follow the real`,
    `// ${packageName} contract (soroban-sdk ${SOROBAN_SDK_VERSION}). The`,
    `// Playground sandbox executes the real contract wasm locally; the`,
    `// selected network only matters when deploying to a live network.`,
    `// Verify this example against your project before shipping.`,
  );
  lines.push(`// ${rule}`);

  lines.push("");
  lines.push("use soroban_sdk::{");
  lines.push("    testutils::Address as _,");
  lines.push(`    ${sdkImports.join(", ")},`);
  lines.push("};");
  lines.push("");
  lines.push(`use ${packageIdentifier}::${clientName};`);
  lines.push("");

  lines.push(
    `/// Deploys ${component.name} from its compiled wasm and drives the`,
    `/// public interface inside an isolated Soroban host environment — the`,
    `/// same pattern the Playground's sandbox-runner uses for local execution.`,
  );
  lines.push("fn integration_example(env: &Env) {");
  lines.push("    let admin = Address::generate(env);");
  lines.push("    let alice = Address::generate(env);");
  lines.push("    let bob = Address::generate(env);");
  lines.push("");

  lines.push("    // 1 · Deploy — the constructor runs at deployment.");
  if (constructor) {
    const params = constructor.params
      .map((param) => `${param.name}: ${param.type}`)
      .join(", ");
    lines.push(`    //    ${constructor.name}(${params})`);
  }
  lines.push(
    `    let wasm: Bytes = Bytes::from_slice(`,
    `        env,`,
    `        &include_bytes!("../target/${implementation.buildTarget}/release/${packageIdentifier}.wasm")[..],`,
    `    );`,
  );
  lines.push("    let wasm_hash = env.deployer().upload_contract_wasm(wasm);");
  lines.push(`    let ${clientVar}_address = env`);
  lines.push("        .deployer()");
  lines.push("        .with_address(admin.clone(), [0u8; 32])");
  lines.push("        .deploy_v2(");
  lines.push("            wasm_hash,");
  lines.push("            (");
  if (constructor) {
    for (const param of constructor.params) {
          lines.push(
            `                ${constructorArg(param, configValues, dependencyAliases, constructorArgs)}, // ${param.name}`,
          );
    }
  }
  lines.push("            ),");
  lines.push("        );");
  lines.push(
    `    let ${clientVar} = ${clientName}::new(env, &${clientVar}_address);`,
  );
  lines.push("");

  if (dependencies.length > 0) {
    lines.push("    // 3 · Dependencies — auto-provisioned by the Playground sandbox.");
    lines.push("    //    Each dependency is deployed from its own contract wasm; the");
    lines.push("    //    sandbox resolves it by alias. Provide the deployed address");
    lines.push("    //    here (illustratively generated) when adapting this example.");
    for (const dependency of dependencies) {
      lines.push(
        `    let ${snakeCase(dependency.alias)}_address = Address::generate(env); // alias: ${dependency.alias} → ${dependency.package}`,
      );
    }
    lines.push("");
  }

  lines.push("    // 4 · Interface examples from the catalog interface.");
  lines.push(
    "    //    Authorized operations assume host-level mock auth, like the",
  );
  lines.push(
    "    //    contract's own test suite; live networks require real auth.",
  );
  lines.push("");
  for (const fn of callableFns) {
    const signature = fn.params
      .map((param) => `${param.name}: ${param.type}`)
      .join(", ");
    const returns = fn.returns ? ` -> ${fn.returns}` : "";
    lines.push(`    // ${fn.name}(${signature})${returns}`);
    if (fn.description) {
      lines.push(`    // ${fn.description}`);
    }
    if (fn.authorization === "admin") {
      lines.push("    // requires the contract administrator's authorization");
    } else if (fn.authorization === "first-address") {
      const firstAddress = fn.params.find(
        (param) => param.type === "Address" || param.type === "MuxedAddress",
      );
      lines.push(
        `    // requires authorization from ${
          firstAddress?.name ?? "the first address argument"
        }`,
      );
    }
    const args = fn.params
      .map((param) => placeholderArg(param, dependencyAliases))
      .join(", ");
    const call = `${clientVar}.${fn.name}(${args})`;
    if (fn.returns) {
      lines.push(`    let ${fn.name}: ${fn.returns} = ${call};`);
    } else {
      lines.push(`    ${call};`);
    }
    lines.push("");
  }

  lines.push("}");
  lines.push("");
  lines.push("fn main() {");
  lines.push("    integration_example(&Env::default());");
  lines.push("}");

  return lines.join("\n");
}

export function generateTypescriptIntegration({
  component,
  configValues,
}: IntegrationContext): string | null {
  const interfaceFns = component.interface ?? [];
  const implementation = component.implementation;
  if (!implementation || interfaceFns.length === 0) {
    return null;
  }

  const constructor = interfaceFns.find((fn) => fn.name === "__constructor");
  const callableFns = interfaceFns.filter((fn) => fn.name !== "__constructor");
  const dependencies = component.dependencies ?? [];
  const dependencyAliases = new Set(dependencies.map((dep) => dep.alias));
  const constructorArgs = component.constructorArgs ?? {};
  const packageName = implementation.package;

  const lines: string[] = [];
  const rule = "=".repeat(76);
  lines.push(`// ${rule}`);
  lines.push(
    `// Stellar-Forge · integration example · ${component.name} · TypeScript`,
  );
  lines.push(`// ${rule}`);

  const metadata: Array<[string, string]> = [
    ["Component", component.name],
    ["Slug", component.slug],
    ["Category", component.category],
    ["Status", componentMaturity(component)],
    ["Package", packageName],
    ["Source", implementation.sourcePath],
    ["Build target", implementation.buildTarget],
  ];
  const labelWidth = Math.max(...metadata.map(([label]) => label.length));
  for (const [label, value] of metadata) {
    lines.push(`// ${label.padEnd(labelWidth)} : ${value}`);
  }

  lines.push("//");
  lines.push("// Configuration:");
  for (const field of component.config ?? []) {
    const value = configValues[field.key] ?? field.default;
    lines.push(
      `//   ${field.key.padEnd(12)} = ${value}    // ${field.label}`,
    );
  }

  lines.push("//");
  lines.push(
    "// Generated from the catalog interface — a starting point for integration",
    "// work, not a complete SDK. It invokes the contract's real interface using",
    "// @stellar/stellar-sdk. Deployment is performed separately (see the note",
    "// below). Verify this example against your project before shipping.",
  );
  lines.push(`// ${rule}`);

  lines.push("");
  lines.push(
    'import {',
    '  Address,',
    '  Contract,',
    '  Keypair,',
    '  TransactionBuilder,',
    '  nativeToScVal,',
    '  rpc,',
    '  scValToNative,',
    '  xdr,',
    '} from "@stellar/stellar-sdk";',
  );

  lines.push("");
  lines.push("// ---- Configuration (edit these) ---------------------------------------");
  lines.push(
    'const RPC_URL = "https://soroban-testnet.stellar.org"; // Stellar Testnet RPC',
  );
  lines.push(
    'const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";',
  );
  lines.push(
    'const CONTRACT_ID = "<CONTRACT_ID>"; // deployed contract address (C...); replace with your deployment',
  );
  lines.push(
    'const SOURCE_SECRET = "<YOUR_SECRET_KEY>"; // signer secret (S...); keep safe, never commit',
  );

  lines.push("");
  lines.push(
    "// Example identities — replace with real addresses (G... accounts or C... contracts).",
  );
  lines.push('const admin = new Address("<ADMIN_ADDRESS>");');
  lines.push('const alice = new Address("<ALICE_ADDRESS>");');
  lines.push('const bob = new Address("<BOB_ADDRESS>");');
  for (const dependency of dependencies) {
    lines.push(
      `const ${dependency.alias}Address = new Address("<DEPLOYED_${dependency.alias.toUpperCase()}_ADDRESS>"); // alias: ${dependency.alias} → ${dependency.package}`,
    );
  }

  lines.push("");
  lines.push("async function main() {");
  lines.push("  const server = new rpc.Server(RPC_URL);");
  lines.push("  const sourceKeypair = Keypair.fromSecret(SOURCE_SECRET);");
  lines.push("  const contract = new Contract(CONTRACT_ID);");
  lines.push("");
  lines.push(
    "  // Deployment of this contract is performed separately (for example via the",
  );
  if (constructor) {
    const ctorSig = constructor.params
      .map((param) => `${param.name}: ${param.type}`)
      .join(", ");
    lines.push(
      "  // Stellar CLI: stellar contract deploy --wasm",
      `  //   target/wasm32v1-none/release/${packageName}.wasm \\`,
      "  //   --source <signer> --network testnet --",
      `  //   ${constructor.params
        .map((param) =>
          cliLiteral(param, configValues, dependencyAliases, constructorArgs),
        )
        .join(" ")}`,
      `  // Constructor: ${constructor.name}(${ctorSig})`,
    );
  } else {
    lines.push(
      `  // Stellar CLI: stellar contract deploy --wasm target/wasm32v1-none/release/${packageName}.wasm --source <signer> --network testnet`,
    );
  }
  lines.push("");

  lines.push("  async function invoke(");
  lines.push("    method: string,");
  lines.push("    args: xdr.ScVal[],");
  lines.push("  ): Promise<rpc.Api.SendTransactionResponse> {");
  lines.push(
    "    const sourceAccount = await server.getAccount(sourceKeypair.publicKey());",
  );
  lines.push("    const tx = new TransactionBuilder(sourceAccount, {");
  lines.push('      fee: "100",');
  lines.push("      networkPassphrase: NETWORK_PASSPHRASE,");
  lines.push("    })");
  lines.push("      .addOperation(contract.call(method, ...args))");
  lines.push("      .setTimeout(30)");
  lines.push("      .build();");
  lines.push("    const prepared = await server.prepareTransaction(tx);");
  lines.push("    prepared.sign(sourceKeypair);");
  lines.push("    return server.sendTransaction(prepared);");
  lines.push("  }");
  lines.push("");

  for (const fn of callableFns) {
    const signature = fn.params.map((param) => `${param.name}: ${param.type}`).join(", ");
    const returns = fn.returns ? ` -> ${fn.returns}` : "";
    lines.push(`  // ${fn.name}(${signature})${returns}`);
    if (fn.description) {
      lines.push(`  // ${fn.description}`);
    }
    if (fn.authorization === "admin") {
      lines.push(
        "  // Requires the contract administrator's authorization (the admin set at deploy time).",
      );
    } else if (fn.authorization === "first-address") {
      const firstAddress = fn.params.find(
        (param) => param.type === "Address" || param.type === "MuxedAddress",
      );
      lines.push(
        `  // Requires authorization from the first address argument${
          firstAddress ? ` (${firstAddress.name})` : ""
        }. The signing wallet must own that address.`,
      );
    }
    const args = fn.params.map((param) =>
      tsMethodArgValue(param, dependencyAliases),
    );
    lines.push(`  const ${fn.name}Args: xdr.ScVal[] = [`);
    for (const arg of args) {
      lines.push(`    ${arg},`);
    }
    lines.push("  ];");
    lines.push(
      `  const ${fn.name}Result = await invoke("${fn.name}", ${fn.name}Args);`,
    );
    lines.push(
      `  // Decode the return value (if any): scValToNative(${fn.name}Result.returnValue)`,
    );
    lines.push("");
  }

  lines.push("}");
  lines.push("");
  lines.push(
    'main().catch((err) => { console.error(err); process.exitCode = 1; });',
  );

  return lines.join("\n");
}

// Builds a CLI-style literal for a constructor argument (used only in the
// deploy comment). These are placeholder tokens, not SDK expressions.
function cliLiteral(
  param: ParameterSpec,
  configValues: Record<string, string>,
  dependencyAliases: Set<string>,
  constructorArgs: Record<string, string>,
): string {
  if (dependencyAliases.has(param.name)) {
    return `<${param.name.toUpperCase()}_ADDRESS>`;
  }
  const candidates = [
    param.name,
    param.name.toLowerCase(),
    param.name.replace(/s$/, ""),
    `${param.name}s`,
  ];
  const value =
    candidates.map((key) => configValues[key]).find((v) => v !== undefined) ??
    constructorArgs[param.name] ??
    "";
  switch (param.type) {
    case "Address":
    case "MuxedAddress":
      return `<${param.name.toUpperCase()}_ADDRESS>`;
    case "i128":
      return value.length > 0 ? value : "1000000";
    case "u32":
      return value.length > 0 ? value : "200";
    case "String":
    case "Symbol":
      return value.length > 0
        ? `"${value}"`
        : `"${param.type === "Symbol" ? "symbol" : "value"}"`;
    default:
      return `<${param.name}>`;
  }
}

// Maps a method parameter to a TypeScript expression that produces the
// corresponding ScVal via @stellar/stellar-sdk's nativeToScVal / Address.
function tsMethodArgValue(
  param: ParameterSpec,
  dependencyAliases: Set<string> = new Set(),
): string {
  if (dependencyAliases.has(param.name)) {
    return `${param.name}Address.toScVal()`;
  }
  if (param.type === "MuxedAddress") {
    return 'new Address("<MUXED_ADDRESS>").toScVal() /* muxed (M...) */';
  }
  if (param.type === "Address") {
    const name = param.name.toLowerCase();
    if (name.includes("admin") || name === "new_admin") return "admin.toScVal()";
    if (name === "to" || name.startsWith("to_")) return "bob.toScVal()";
    if (name.includes("spender")) return "alice.toScVal()";
    return "alice.toScVal()";
  }
  if (param.type === "i128") {
    return 'nativeToScVal(BigInt(1000000), { type: "i128" })';
  }
  if (param.type === "u32") {
    return 'nativeToScVal(200, { type: "u32" })';
  }
  if (param.type === "String") {
    return 'nativeToScVal("value", { type: "string" })';
  }
  if (param.type === "Symbol") {
    return 'nativeToScVal("symbol", { type: "symbol" })';
  }
  return `nativeToScVal(null) /* ${param.name}: ${param.type} — configure me */`;
}

function constructorArg(
  param: ParameterSpec,
  configValues: Record<string, string>,
  dependencyAliases: Set<string> = new Set(),
  constructorArgs: Record<string, string> = {},
): string {
  if (param.type === "Address") {
    // A constructor parameter that is a dependency alias resolves to the
    // provisioned dependency address, mirroring how method arguments are handled
    // in `placeholderArg`. This keeps the generated example correct for
    // components whose constructor receives a dependency (e.g. Escrow's asset).
    return dependencyAliases.has(param.name)
      ? `&${param.name}_address`
      : "admin.clone()";
  }
  const candidates = [
    param.name,
    param.name.toLowerCase(),
    param.name.replace(/s$/, ""),
    `${param.name}s`,
  ];
  // Prefer a config-backed value; otherwise fall back to the component's
  // catalog constructorArgs (e.g. numeric defaults such as amount, interval,
  // or threshold). The value is always read from catalog metadata, so the
  // generated example stays compilable with no component-specific branch.
  const value =
    candidates.map((key) => configValues[key]).find((v) => v !== undefined) ??
    constructorArgs[param.name] ??
    "";
  if (param.type === "u32" && value.length > 0) return `${value}_u32`;
  if (param.type === "i128" && value.length > 0) return `${value}_i128`;
  if (param.type === "String") {
    return `String::from_str(env, "${value}")`;
  }
  if (param.type === "Symbol") {
    return `Symbol::new(env, "${value}")`;
  }
  if (param.type === "MuxedAddress") {
    return `MuxedAddress::from_str(env, "<muxed address>")`;
  }
  return `/* ${param.name}: ${param.type} — configure me */`;
}

function snakeCase(name: string): string {
  return name
    .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    .replace(/-/g, "_")
    .replace(/^_/, "");
}

function pascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function placeholderArg(
  param: ParameterSpec,
  dependencyAliases: Set<string> = new Set(),
): string {
  if (dependencyAliases.has(param.name)) return `&${param.name}_address`;
  if (param.type === "MuxedAddress") {
    return '&MuxedAddress::from_str(env, "<muxed address>")';
  }
  if (param.type === "i128") return "&1_000_000";
  if (param.type === "u32") return "&200";
  if (param.type === "String") {
    return '&String::from_str(env, "value")';
  }
  if (param.type === "Symbol") return '&Symbol::new(env, "value")';
  const name = param.name.toLowerCase();
  if (name.includes("admin") || name === "new_admin") return "&admin";
  if (name === "to" || name.startsWith("to_")) return "&bob";
  if (name.includes("spender")) return "&alice";
  return "&alice";
}