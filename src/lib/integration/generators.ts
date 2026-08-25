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
        `                ${constructorArg(param, configValues)}, // ${param.name}`,
      );
    }
  }
  lines.push("            ),");
  lines.push("        );");
  lines.push(
    `    let ${clientVar} = ${clientName}::new(env, &${clientVar}_address);`,
  );
  lines.push("");

  lines.push("    // 2 · Interface examples from the catalog interface.");
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
    const args = fn.params.map((param) => placeholderArg(param)).join(", ");
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

function constructorArg(
  param: ParameterSpec,
  configValues: Record<string, string>,
): string {
  if (param.type === "Address") return "admin.clone()";
  const candidates = [
    param.name,
    param.name.toLowerCase(),
    param.name.replace(/s$/, ""),
    `${param.name}s`,
  ];
  const value =
    candidates.map((key) => configValues[key]).find((v) => v !== undefined) ??
    "";
  if (param.type === "u32" && value.length > 0) return `${value}_u32`;
  if (param.type === "i128" && value.length > 0) return `${value}_i128`;
  if (param.type === "String") {
    return `String::from_str(env, "${value}")`;
  }
  if (param.type === "Symbol") {
    return `Symbol::new(env, "${value}")`;
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

function placeholderArg(param: ParameterSpec): string {
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