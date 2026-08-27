use std::collections::HashMap;
use std::io::Read;
use std::panic::{catch_unwind, AssertUnwindSafe};

use serde_json::{json, Value};
use soroban_sdk::{
    xdr::{ScError, ScVal},
    Address, Bytes, Env, IntoVal, MuxedAddress, String as SdkString, Symbol, TryFromVal, Val,
    Vec as SdkVec,
};

/// Default location of the built contract wasm, relative to the repository
/// root. Overridable via the `wasmPath` request field.
const DEFAULT_WASM_PATH: &str = "contracts/target/wasm32v1-none/release/token.wasm";

/// Salt used to derive the deployed contract's address.
const DEPLOY_SALT: [u8; 32] = [0u8; 32];

/// Deterministic throwaway identities. Fixed strkeys so every execution is
/// reproducible; the request may override or add identities.
const DEFAULT_IDENTITIES: &[(&str, &str)] = &[
    ("admin", "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"),
    ("user1", "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4"),
    ("user2", "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M"),
    ("deployer", "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAITA4"),
];

/// A single typed parameter declaration. The schema is provided by the
/// TypeScript catalog (`src/data/components.ts`) and attached by the API route,
/// so the runner stays agnostic of any specific contract's interface.
struct ParamSpec {
    name: String,
    type_name: String,
}

fn main() {
    let mut input = String::new();
    let response = match std::io::stdin().read_to_string(&mut input) {
        Err(e) => runner_error(format!("failed to read request from stdin: {e}")),
        Ok(_) => match serde_json::from_str::<Value>(&input) {
            Err(e) => runner_error(format!("request is not valid JSON: {e}")),
            Ok(request) => catch_unwind(AssertUnwindSafe(|| execute(request))).unwrap_or_else(
                |panic| match panic.downcast_ref::<&str>() {
                    Some(msg) => runner_error(format!("internal error: {msg}")),
                    None => match panic.downcast_ref::<String>() {
                        Some(msg) => runner_error(format!("internal error: {msg}")),
                        None => runner_error("internal error".to_string()),
                    },
                },
            ),
        },
    };
    println!("{}", serde_json::to_string(&response).expect("response serializes"));
    if response.get("ok").and_then(Value::as_bool) != Some(true) {
        std::process::exit(1);
    }
}

fn execute(request: Value) -> Value {
    let mut identities: HashMap<String, String> = DEFAULT_IDENTITIES
        .iter()
        .map(|(name, key)| (name.to_string(), key.to_string()))
        .collect();
    if let Some(extra) = request.get("identities").and_then(Value::as_object) {
        for (name, key) in extra {
            let Some(key) = key.as_str() else {
                return runner_error(format!("identity {name:?} must be a strkey string"));
            };
            identities.insert(name.clone(), key.to_string());
        }
    }

    let wasm_path = request
        .get("wasmPath")
        .and_then(Value::as_str)
        .unwrap_or(DEFAULT_WASM_PATH);
    let wasm = match std::fs::read(wasm_path) {
        Ok(bytes) => bytes,
        Err(e) => return runner_error(format!("failed to read wasm at {wasm_path:?}: {e}")),
    };

    let constructor_params = match request.get("constructorParams") {
        Some(v) => match parse_param_specs(v) {
            Ok(params) => params,
            Err(e) => return runner_error(format!("constructorParams: {e}")),
        },
        None => return runner_error("request is missing the 'constructorParams' array".to_string()),
    };
    let constructor = match request.get("constructor") {
        Some(c) => c,
        None => return runner_error("request is missing the 'constructor' object".to_string()),
    };
    let calls = match request.get("calls").and_then(Value::as_array) {
        Some(calls) => calls,
        None => return runner_error("request is missing the 'calls' array".to_string()),
    };

    let env = Env::default();

    // Provision declared dependencies first so the component (and its calls) can
    // reference them by alias. This is fully data-driven: every dependency is
    // treated identically, with no component-specific branching in the runner.
    let mut deployed_dependencies: Vec<Value> = Vec::new();
    if let Some(deps) = request.get("dependencies").and_then(Value::as_array) {
        for dep in deps {
            match deploy_dependency(&env, &mut identities, dep) {
                Ok(address) => {
                    let alias = dep
                        .get("alias")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    deployed_dependencies.push(json!({ "alias": alias, "address": address }));
                }
                Err(e) => return runner_error(e),
            }
        }
    }

    // Build the constructor values from the schema, positionally, so the deploy
    // works for any contract whose constructor only uses supported types.
    let mut ctor_vals = Vec::with_capacity(constructor_params.len());
    for param in &constructor_params {
        let value = match constructor.get(&param.name) {
            Some(value) => value,
            None => return runner_error(format!("constructor.{} is required", param.name)),
        };
        match build_arg(&env, &param.type_name, value, &identities) {
            Ok(val) => ctor_vals.push(val),
            Err(e) => return runner_error(format!("constructor.{}: {e}", param.name)),
        }
    }

    let deployer = Address::from_str(&env, &identities["deployer"]);

    // Deployment runs the constructor; constructor auth is mocked exactly like
    // the SDK's own `register` testutils (authorization is recorded, not
    // enforced). Enforcing auth is re-enabled right after, so every subsequent
    // authorized call must provide its own authorization.
    env.mock_all_auths();
    let wasm_bytes: Bytes = Bytes::from_slice(&env, &wasm);
    let wasm_hash = env.deployer().upload_contract_wasm(wasm_bytes);
    let contract = env
        .deployer()
        .with_address(deployer, DEPLOY_SALT)
        .deploy_v2(wasm_hash, SdkVec::from_iter(&env, ctor_vals));
    env.set_auths(&[]);

    let mut results = Vec::with_capacity(calls.len());
    for call in calls {
        results.push(execute_call(&env, &contract, &identities, call));
    }

    let deployed_strkey =
        std::string::String::from_utf8(contract.to_string().to_bytes().to_alloc_vec())
            .unwrap_or_else(|_| "INVALID_STRKEY".to_string());

    json!({
        "ok": true,
        "deployedContract": deployed_strkey,
        "deployedDependencies": deployed_dependencies,
        "calls": results,
    })
}

/// Deploys a single dependency contract, records its alias -> address in the
/// shared identity map (so later arguments can reference it), and runs any
/// declared setup calls. Returns the deployed contract strkey.
fn deploy_dependency(
    env: &Env,
    identities: &mut HashMap<String, String>,
    dep: &Value,
) -> Result<String, String> {
    let alias = dep
        .get("alias")
        .and_then(Value::as_str)
        .ok_or_else(|| "dependency is missing the 'alias' field".to_string())?;
    let wasm_path = dep
        .get("wasmPath")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("dependency {alias:?} is missing the 'wasmPath' field"))?;
    let wasm = std::fs::read(wasm_path)
        .map_err(|e| format!("failed to read dependency wasm at {wasm_path:?}: {e}"))?;

    let constructor_params = match dep.get("constructorParams") {
        Some(v) => parse_param_specs(v)
            .map_err(|e| format!("dependency {alias} constructorParams: {e}"))?,
        None => return Err(format!("dependency {alias} is missing 'constructorParams'")),
    };
    let constructor = match dep.get("constructor") {
        Some(c) => c,
        None => return Err(format!("dependency {alias} is missing 'constructor'")),
    };

    let mut ctor_vals = Vec::with_capacity(constructor_params.len());
    for param in &constructor_params {
        let value = match constructor.get(&param.name) {
            Some(value) => value,
            None => {
                return Err(format!(
                    "dependency {alias} constructor.{} is required",
                    param.name
                ))
            }
        };
        match build_arg(env, &param.type_name, value, identities) {
            Ok(val) => ctor_vals.push(val),
            Err(e) => {
                return Err(format!(
                    "dependency {alias} constructor.{}: {e}",
                    param.name
                ))
            }
        }
    }

    let deployer = Address::from_str(env, &identities["deployer"]);
    env.mock_all_auths();
    let wasm_bytes: Bytes = Bytes::from_slice(env, &wasm);
    let wasm_hash = env.deployer().upload_contract_wasm(wasm_bytes);
    let contract = env
        .deployer()
        .with_address(deployer, dependency_salt(alias))
        .deploy_v2(wasm_hash, SdkVec::from_iter(env, ctor_vals));
    env.set_auths(&[]);

    let strkey = std::string::String::from_utf8(contract.to_string().to_bytes().to_alloc_vec())
        .unwrap_or_else(|_| "INVALID_STRKEY".to_string());
    identities.insert(alias.to_string(), strkey.clone());

    if let Some(setup) = dep.get("setup").and_then(Value::as_array) {
        for call in setup {
            let outcome = execute_call(env, &contract, identities, call);
            if outcome.get("ok").and_then(Value::as_bool) != Some(true) {
                return Err(format!(
                    "dependency {alias} setup failed: {}",
                    outcome.to_string()
                ));
            }
        }
    }

    Ok(strkey)
}

/// Derives a deterministic deploy salt from the dependency alias so repeated
/// runs are reproducible and distinct aliases never collide.
fn dependency_salt(alias: &str) -> [u8; 32] {
    let mut salt = [0u8; 32];
    let bytes = alias.as_bytes();
    let n = bytes.len().min(32);
    salt[..n].copy_from_slice(&bytes[..n]);
    salt
}

fn execute_call(
    env: &Env,
    contract: &Address,
    identities: &HashMap<String, String>,
    call: &Value,
) -> Value {
    let Some(fn_name) = call.get("fn").and_then(Value::as_str) else {
        return call_error(None, "call is missing the 'fn' field".to_string());
    };
    if fn_name == "__constructor" {
        return call_error(
            Some(fn_name),
            "__constructor runs at deployment time via the request 'constructor' field".to_string(),
        );
    }
    let params = match call.get("params") {
        Some(v) => match parse_param_specs(v) {
            Ok(params) => params,
            Err(e) => return call_error(Some(fn_name), format!("params: {e}")),
        },
        None => return call_error(Some(fn_name), "call is missing the 'params' array".to_string()),
    };
    let args = call.get("args").cloned().unwrap_or(Value::Null);
    let arg_vals = match build_args(env, fn_name, &params, &args, identities) {
        Ok(vals) => vals,
        Err(e) => return call_error(Some(fn_name), e),
    };

    // The sandbox assumes host-level mock authorization (see ARCHITECTURE.md).
    // `mock_all_auths_allowing_non_root_auth` covers both the invoked function
    // and any nested cross-contract calls (e.g. a payment contract invoking an
    // asset's `transfer`), so components can be exercised generically without
    // per-component auth wiring.
    env.mock_all_auths_allowing_non_root_auth();

    let result: Result<Result<Val, _>, _> =
        env.try_invoke_contract(&contract, &Symbol::new(env, fn_name), arg_vals);
    match result {
        Ok(Ok(val)) => json!({
            "fn": fn_name,
            "ok": true,
            "result": val_to_json(env, &val),
        }),
        Ok(Err(_)) => unreachable!("Val conversion cannot fail"),
        Err(Ok(error)) => json!({
            "fn": fn_name,
            "ok": false,
            "error": error_to_json(error),
        }),
        Err(Err(invoke_error)) => json!({
            "fn": fn_name,
            "ok": false,
            "error": {
                "kind": "invoke",
                "message": format!("{invoke_error:?}"),
            },
        }),
    }
}

fn build_args(
    env: &Env,
    fn_name: &str,
    params: &[ParamSpec],
    args: &Value,
    identities: &HashMap<String, String>,
) -> Result<SdkVec<Val>, String> {
    let arr = args
        .as_array()
        .ok_or_else(|| format!("args for {fn_name} must be a JSON array"))?;
    if arr.len() != params.len() {
        return Err(format!(
            "{fn_name} expects {} argument(s), got {}",
            params.len(),
            arr.len()
        ));
    }
    let mut vals = Vec::with_capacity(params.len());
    for (param, arg) in params.iter().zip(arr) {
        vals.push(build_arg(env, &param.type_name, arg, identities)?);
    }
    Ok(SdkVec::from_iter(env, vals))
}

fn build_arg(
    env: &Env,
    type_name: &str,
    arg: &Value,
    identities: &HashMap<String, String>,
) -> Result<Val, String> {
    match type_name {
        "Address" => {
            let s = arg
                .as_str()
                .ok_or_else(|| format!("address argument must be a string, got {arg}"))?;
            Ok(resolve_address(env, identities, s)?.to_val())
        }
        "MuxedAddress" => {
            let s = arg
                .as_str()
                .ok_or_else(|| format!("muxed address argument must be a string, got {arg}"))?;
            let strkey = identities.get(s).map(String::as_str).unwrap_or(s);
            Ok(MuxedAddress::from_str(env, strkey).to_val())
        }
        "i128" => Ok(parse_i128(arg)?.into_val(env)),
        "u32" => Ok(parse_u32(arg)?.into_val(env)),
        "String" => {
            let s = arg
                .as_str()
                .ok_or_else(|| format!("string argument must be a string, got {arg}"))?;
            Ok(SdkString::from_str(env, s).to_val())
        }
        "Symbol" => {
            let s = arg
                .as_str()
                .ok_or_else(|| format!("symbol argument must be a string, got {arg}"))?;
            Ok(Symbol::new(env, s).to_val())
        }
        other => Err(format!("unsupported parameter type: {other}")),
    }
}

fn parse_param_specs(value: &Value) -> Result<Vec<ParamSpec>, String> {
    let arr = value
        .as_array()
        .ok_or_else(|| "must be a JSON array".to_string())?;
    let mut specs = Vec::with_capacity(arr.len());
    for item in arr {
        let name = item
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| "param is missing a string 'name'".to_string())?;
        let type_name = item
            .get("type")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("param {name:?} is missing a string 'type'"))?;
        specs.push(ParamSpec {
            name: name.to_string(),
            type_name: type_name.to_string(),
        });
    }
    Ok(specs)
}

fn resolve_address(
    _env: &Env,
    identities: &HashMap<String, String>,
    s: &str,
) -> Result<Address, String> {
    let key = identities.get(s).map(String::as_str).unwrap_or(s);
    if key.starts_with('G') || key.starts_with('C') {
        Ok(Address::from_str(_env, key))
    } else {
        Err(format!("unknown identity or invalid address: {s}"))
    }
}

fn parse_i128(value: &Value) -> Result<i128, String> {
    if let Some(n) = value.as_i64() {
        return Ok(n as i128);
    }
    if let Some(s) = value.as_str() {
        return s
            .parse::<i128>()
            .map_err(|_| format!("invalid i128 value: {s}"));
    }
    Err(format!("expected an i128 amount, got {value}"))
}

fn parse_u32(value: &Value) -> Result<u32, String> {
    if let Some(n) = value.as_u64() {
        return u32::try_from(n).map_err(|_| format!("u32 out of range: {n}"));
    }
    if let Some(s) = value.as_str() {
        return s
            .parse::<u32>()
            .map_err(|_| format!("invalid u32 value: {s}"));
    }
    Err(format!("expected a u32 value, got {value}"))
}

fn val_to_json(env: &Env, val: &Val) -> Value {
    match ScVal::try_from_val(env, val) {
        Ok(scval) => scval_to_json(env, scval),
        Err(_) => json!(format!("{val:?}")),
    }
}

fn scval_to_json(env: &Env, scval: ScVal) -> Value {
    match scval {
        ScVal::Void => Value::Null,
        ScVal::Bool(b) => json!(b),
        ScVal::U32(n) => json!(n),
        ScVal::I32(n) => json!(n),
        ScVal::U64(n) => json!(n),
        ScVal::I64(n) => json!(n),
        ScVal::Timepoint(t) => json!(t.0),
        ScVal::Duration(d) => json!(d.0),
        ScVal::U128(parts) => json!(((parts.hi as u128) << 64) | parts.lo as u128),
        ScVal::I128(parts) => json!(((parts.hi as i128) << 64) | parts.lo as i128),
        ScVal::Bytes(bytes) => json!(format!(
            "0x{}",
            bytes
                .0
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<std::string::String>()
        )),
        ScVal::String(s) => json!(std::string::String::from_utf8_lossy(&s.0).to_string()),
        ScVal::Symbol(s) => json!(std::string::String::from_utf8_lossy(&s.0).to_string()),
        ScVal::Vec(Some(items)) => json!(
            items
                .0
                .iter()
                .map(|v| scval_to_json(env, v.clone()))
                .collect::<Vec<_>>()
        ),
        ScVal::Vec(None) => json!([]),
        ScVal::Map(Some(pairs)) => json!(
            pairs
                .0
                .iter()
                .map(|entry| json!({
                    "key": scval_to_json(env, entry.key.clone()),
                    "value": scval_to_json(env, entry.val.clone()),
                }))
                .collect::<Vec<_>>()
        ),
        ScVal::Map(None) => json!({}),
        ScVal::Address(sc_address) => match Address::try_from_val(env, &sc_address) {
            Ok(address) => json!(
                std::string::String::from_utf8(address.to_string().to_bytes().to_alloc_vec())
                    .unwrap_or_default()
            ),
            Err(_) => json!(format!("{sc_address:?}")),
        },
        other => json!(format!("{other:?}")),
    }
}

fn error_to_json(error: soroban_sdk::Error) -> Value {
    match ScError::try_from(error) {
        Ok(ScError::Contract(code)) => json!({
            "kind": "contract",
            "type": "Contract",
            "code": code,
        }),
        Ok(sc) => json!({
            "kind": "contract",
            "type": sc.name(),
            "code": sc_error_code_name(&sc),
        }),
        Err(_) => json!({
            "kind": "contract",
            "type": "Unknown",
            "code": error.get_code(),
        }),
    }
}

fn sc_error_code_name(sc: &ScError) -> String {
    match sc {
        ScError::Contract(code) => code.to_string(),
        ScError::WasmVm(code)
        | ScError::Context(code)
        | ScError::Storage(code)
        | ScError::Object(code)
        | ScError::Crypto(code)
        | ScError::Events(code)
        | ScError::Budget(code)
        | ScError::Value(code)
        | ScError::Auth(code) => code.name().to_string(),
    }
}

fn call_error(fn_name: Option<&str>, message: String) -> Value {
    let mut error = json!({ "kind": "runner", "message": message });
    if let Some(fn_name) = fn_name {
        error["fn"] = json!(fn_name);
    }
    json!({ "ok": false, "error": error })
}

fn runner_error(message: String) -> Value {
    json!({ "ok": false, "error": { "kind": "runner", "message": message } })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identities() -> HashMap<String, String> {
        DEFAULT_IDENTITIES
            .iter()
            .map(|(name, key)| (name.to_string(), key.to_string()))
            .collect()
    }

    fn params(value: Value) -> Vec<ParamSpec> {
        parse_param_specs(&value).unwrap()
    }

    #[test]
    fn converts_args_by_type() {
        let env = Env::default();
        let specs = params(json!([
            { "name": "admin", "type": "Address" },
            { "name": "to_muxed", "type": "MuxedAddress" },
            { "name": "amount", "type": "i128" },
            { "name": "ledger", "type": "u32" },
            { "name": "label", "type": "String" },
            { "name": "tag", "type": "Symbol" },
        ]));
        let args = json!(["admin", "user1", "9007199254740993", "42", "Hello", "FORGE"]);
        let vals = build_args(&env, "demo", &specs, &args, &identities()).unwrap();
        assert_eq!(vals.len(), 6);
        assert_eq!(
            val_to_json(&env, &vals.get(0).unwrap()),
            json!("CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM")
        );
        assert_eq!(
            val_to_json(&env, &vals.get(1).unwrap()),
            json!("CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4")
        );
        assert_eq!(val_to_json(&env, &vals.get(2).unwrap()), json!(9007199254740993i64));
        assert_eq!(val_to_json(&env, &vals.get(3).unwrap()), json!(42));
        assert_eq!(val_to_json(&env, &vals.get(4).unwrap()), json!("Hello"));
        assert_eq!(val_to_json(&env, &vals.get(5).unwrap()), json!("FORGE"));
    }

    #[test]
    fn rejects_mismatched_arg_counts() {
        let env = Env::default();
        let specs = params(json!([{ "name": "a", "type": "u32" }]));
        match build_args(&env, "f", &specs, &json!([1, 2]), &identities()) {
            Err(e) => assert!(e.contains("expects 1 argument(s)"), "unexpected error: {e}"),
            Ok(_) => panic!("expected an argument count error"),
        }
    }

    #[test]
    fn rejects_unsupported_types() {
        let env = Env::default();
        let specs = params(json!([{ "name": "a", "type": "Bytes" }]));
        assert!(build_args(&env, "f", &specs, &json!([1]), &identities()).is_err());
    }

    #[test]
    fn rejects_unknown_identities() {
        let env = Env::default();
        assert!(resolve_address(&env, &identities(), "admin").is_ok());
        assert!(resolve_address(
            &env,
            &identities(),
            "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"
        )
        .is_ok());
        assert!(resolve_address(&env, &identities(), "nobody").is_err());
    }

    #[test]
    fn decodes_scvals_to_json() {
        let env = Env::default();
        assert_eq!(val_to_json(&env, &Val::from_void().to_val()), Value::Null);
        assert_eq!(val_to_json(&env, &Val::from_bool(true).to_val()), json!(true));
        assert_eq!(val_to_json(&env, &(42u32).into_val(&env)), json!(42));
        assert_eq!(
            val_to_json(&env, &SdkString::from_str(&env, "hello").to_val()),
            json!("hello")
        );
        assert_eq!(
            val_to_json(&env, &Symbol::new(&env, "TAG").to_val()),
            json!("TAG")
        );
        assert_eq!(val_to_json(&env, &1000i128.into_val(&env)), json!(1000));
        let vec = SdkVec::<Val>::from_slice(&env, &[10u32.into_val(&env), 20u32.into_val(&env)]);
        assert_eq!(val_to_json(&env, &vec.to_val()), json!([10, 20]));
    }

    #[test]
    fn deploys_and_resolves_dependencies() {
        // The dependency mechanism drives a real wasm deploy; skip when the
        // artifact has not been built (CI's Rust job does not run the Stellar
        // CLI, so the wasm is absent there).
        let wasm = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/wasm32v1-none/release/token.wasm"
        );
        if !std::path::Path::new(wasm).exists() {
            return;
        }
        let request = json!({
            "wasmPath": wasm,
            "constructorParams": [
                { "name": "admin", "type": "Address" },
                { "name": "decimal", "type": "u32" },
                { "name": "name", "type": "String" },
                { "name": "symbol", "type": "String" },
            ],
            "constructor": {
                "admin": "admin",
                "decimal": "7",
                "name": "Main",
                "symbol": "MAIN",
            },
            "dependencies": [{
                "alias": "asset",
                "wasmPath": wasm,
                "constructorParams": [
                    { "name": "admin", "type": "Address" },
                    { "name": "decimal", "type": "u32" },
                    { "name": "name", "type": "String" },
                    { "name": "symbol", "type": "String" },
                ],
                "constructor": {
                    "admin": "admin",
                    "decimal": "7",
                    "name": "Asset",
                    "symbol": "AST",
                },
                "setup": [
                    {
                        "fn": "mint",
                        "params": [
                            { "name": "to", "type": "Address" },
                            { "name": "amount", "type": "i128" },
                        ],
                        "args": ["admin", "1000000"],
                        "signer": "admin",
                    }
                ],
            }],
            "calls": [{
                "fn": "balance",
                "params": [{ "name": "id", "type": "Address" }],
                "args": ["asset"],
            }],
        });
        let response = execute(request);
        assert_eq!(
            response.get("ok").and_then(Value::as_bool),
            Some(true),
            "response was: {}",
            response
        );
        let deps = response
            .get("deployedDependencies")
            .and_then(Value::as_array)
            .expect("response includes deployedDependencies");
        assert_eq!(deps.len(), 1);
        assert_eq!(deps[0].get("alias").and_then(Value::as_str), Some("asset"));
        let address = deps[0].get("address").and_then(Value::as_str).unwrap_or("");
        assert!(address.starts_with('C'), "unexpected dependency address: {address}");

        let calls = response.get("calls").and_then(Value::as_array).unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].get("ok").and_then(Value::as_bool), Some(true));
    }

    #[test]
    fn payment_executes_against_provisioned_dependency() {
        // End-to-end boundary for the documented developer journey:
        //   Payment -> asset dependency -> dependency provisioning ->
        //   Payment deployment -> pay(from, to, asset, amount) ->
        //   successful cross-contract execution.
        // Skips when the wasm artifacts are not built (CI's Rust job does not
        // run the Stellar CLI).
        let payment_wasm = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/wasm32v1-none/release/payment.wasm"
        );
        let token_wasm = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/wasm32v1-none/release/token.wasm"
        );
        if !std::path::Path::new(payment_wasm).exists() || !std::path::Path::new(token_wasm).exists() {
            return;
        }
        let request = json!({
            "wasmPath": payment_wasm,
            "constructorParams": [],
            "constructor": {},
            "dependencies": [{
                "alias": "asset",
                "wasmPath": token_wasm,
                "constructorParams": [
                    { "name": "admin", "type": "Address" },
                    { "name": "decimal", "type": "u32" },
                    { "name": "name", "type": "String" },
                    { "name": "symbol", "type": "String" },
                ],
                "constructor": {
                    "admin": "admin",
                    "decimal": "7",
                    "name": "Payment Asset",
                    "symbol": "PAY",
                },
                "setup": [
                    {
                        "fn": "mint",
                        "params": [
                            { "name": "to", "type": "Address" },
                            { "name": "amount", "type": "i128" },
                        ],
                        "args": ["admin", "1000000"],
                        "signer": "admin",
                    }
                ],
            }],
            "calls": [{
                "fn": "pay",
                "params": [
                    { "name": "from", "type": "Address" },
                    { "name": "to", "type": "Address" },
                    { "name": "asset", "type": "Address" },
                    { "name": "amount", "type": "i128" },
                ],
                "args": ["admin", "user1", "asset", "100"],
                "signer": "admin",
            }],
        });
        let response = execute(request);
        assert_eq!(
            response.get("ok").and_then(Value::as_bool),
            Some(true),
            "response was: {}",
            response
        );
        let deps = response
            .get("deployedDependencies")
            .and_then(Value::as_array)
            .expect("response includes deployedDependencies");
        assert_eq!(deps.len(), 1);
        assert_eq!(deps[0].get("alias").and_then(Value::as_str), Some("asset"));
        let calls = response.get("calls").and_then(Value::as_array).unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(
            calls[0].get("ok").and_then(Value::as_bool),
            Some(true),
            "pay call failed: {}",
            calls[0]
        );
    }

    #[test]
    fn escrow_executes_against_provisioned_dependency() {
        // End-to-end boundary for the Escrow component's generic support:
        //   Escrow -> asset dependency (alias "asset") -> dependency
        //   provisioning -> Escrow deployment (asset passed into the
        //   constructor as the dependency alias) -> deposit/release/status ->
        //   real state transition. Proves the platform needs no Escrow-specific
        //   branching: the same provisioning path that serves Payment serves
        //   Escrow, and the alias resolves into the primary constructor.
        // Skips when the wasm artifacts are not built (CI's Rust job does not
        // run the Stellar CLI).
        let escrow_wasm = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/wasm32v1-none/release/escrow.wasm"
        );
        let token_wasm = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/wasm32v1-none/release/token.wasm"
        );
        if !std::path::Path::new(escrow_wasm).exists()
            || !std::path::Path::new(token_wasm).exists()
        {
            return;
        }
        let request = json!({
            "wasmPath": escrow_wasm,
            "constructorParams": [
                { "name": "depositor", "type": "Address" },
                { "name": "beneficiary", "type": "Address" },
                { "name": "arbiter", "type": "Address" },
                { "name": "asset", "type": "Address" },
            ],
            "constructor": {
                "depositor": "user1",
                "beneficiary": "user2",
                "arbiter": "admin",
                "asset": "asset",
            },
            "dependencies": [{
                "alias": "asset",
                "wasmPath": token_wasm,
                "constructorParams": [
                    { "name": "admin", "type": "Address" },
                    { "name": "decimal", "type": "u32" },
                    { "name": "name", "type": "String" },
                    { "name": "symbol", "type": "String" },
                ],
                "constructor": {
                    "admin": "admin",
                    "decimal": "7",
                    "name": "Escrow Asset",
                    "symbol": "EAC",
                },
                "setup": [
                    {
                        "fn": "mint",
                        "params": [
                            { "name": "to", "type": "Address" },
                            { "name": "amount", "type": "i128" },
                        ],
                        "args": ["user1", "1000000"],
                        "signer": "admin",
                    }
                ],
            }],
            "calls": [
                {
                    "fn": "deposit",
                    "params": [
                        { "name": "depositor", "type": "Address" },
                        { "name": "amount", "type": "i128" },
                    ],
                    "args": ["user1", "400"],
                    "signer": "user1",
                },
                {
                    "fn": "release",
                    "params": [
                        { "name": "arbiter", "type": "Address" },
                    ],
                    "args": ["admin"],
                    "signer": "admin",
                },
                {
                    "fn": "status",
                    "params": [],
                    "args": [],
                },
            ],
        });
        let response = execute(request);
        assert_eq!(
            response.get("ok").and_then(Value::as_bool),
            Some(true),
            "response was: {}",
            response
        );
        let deps = response
            .get("deployedDependencies")
            .and_then(Value::as_array)
            .expect("response includes deployedDependencies");
        assert_eq!(deps.len(), 1);
        assert_eq!(deps[0].get("alias").and_then(Value::as_str), Some("asset"));
        let calls = response.get("calls").and_then(Value::as_array).unwrap();
        assert_eq!(calls.len(), 3);
        assert_eq!(
            calls[0].get("ok").and_then(Value::as_bool),
            Some(true),
            "deposit failed: {}",
            calls[0]
        );
        assert_eq!(
            calls[1].get("ok").and_then(Value::as_bool),
            Some(true),
            "release failed: {}",
            calls[1]
        );
        assert_eq!(
            calls[2].get("ok").and_then(Value::as_bool),
            Some(true),
            "status failed: {}",
            calls[2]
        );
        // status() returns the u32 state; after release it must be 1 (Released).
        let status = calls[2].get("result").and_then(Value::as_i64).unwrap_or(-1);
        assert_eq!(status, 1, "expected Released state, got: {}", calls[2]);
    }

    #[test]
    fn access_control_executes_generically() {
        // End-to-end boundary for the Access Control component's generic support:
        //   AccessControl (no dependencies) -> deploy with the admin identity ->
        //   grant_role/revoke_role/transfer_admin (admin-authorized) ->
        //   has_role (read-only) -> real state transitions. Proves the platform
        //   needs no Access-Control-specific branching: the same generic deploy +
        //   invoke path that serves Token/Payment/Escrow serves Access Control,
        //   including its `Symbol` role argument and `admin` authorization model.
        // Skips when the wasm artifact is not built (CI's Rust job does not run
        // the Stellar CLI).
        let access_control_wasm = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/wasm32v1-none/release/access_control.wasm"
        );
        if !std::path::Path::new(access_control_wasm).exists() {
            return;
        }
        let request = json!({
            "wasmPath": access_control_wasm,
            "constructorParams": [
                { "name": "admin", "type": "Address" },
            ],
            "constructor": { "admin": "admin" },
            "calls": [
                {
                    "fn": "grant_role",
                    "params": [
                        { "name": "role", "type": "Symbol" },
                        { "name": "account", "type": "Address" },
                    ],
                    "args": ["minter", "user1"],
                    "signer": "admin",
                },
                {
                    "fn": "has_role",
                    "params": [
                        { "name": "role", "type": "Symbol" },
                        { "name": "account", "type": "Address" },
                    ],
                    "args": ["minter", "user1"],
                },
                {
                    "fn": "revoke_role",
                    "params": [
                        { "name": "role", "type": "Symbol" },
                        { "name": "account", "type": "Address" },
                    ],
                    "args": ["minter", "user1"],
                    "signer": "admin",
                },
                {
                    "fn": "has_role",
                    "params": [
                        { "name": "role", "type": "Symbol" },
                        { "name": "account", "type": "Address" },
                    ],
                    "args": ["minter", "user1"],
                },
                {
                    "fn": "transfer_admin",
                    "params": [
                        { "name": "new_admin", "type": "Address" },
                    ],
                    "args": ["user2"],
                    "signer": "admin",
                },
                {
                    "fn": "grant_role",
                    "params": [
                        { "name": "role", "type": "Symbol" },
                        { "name": "account", "type": "Address" },
                    ],
                    "args": ["manager", "user1"],
                    "signer": "admin",
                },
            ],
        });
        let response = execute(request);
        assert_eq!(
            response.get("ok").and_then(Value::as_bool),
            Some(true),
            "response was: {}",
            response
        );
        let calls = response.get("calls").and_then(Value::as_array).unwrap();
        assert_eq!(calls.len(), 6);

        assert_eq!(
            calls[0].get("ok").and_then(Value::as_bool),
            Some(true),
            "grant_role failed: {}",
            calls[0]
        );
        // has_role returns bool; after grant it must be true.
        assert_eq!(
            calls[1].get("ok").and_then(Value::as_bool),
            Some(true),
            "has_role (granted) failed: {}",
            calls[1]
        );
        assert_eq!(
            calls[1].get("result").and_then(Value::as_bool),
            Some(true),
            "expected has_role == true after grant, got: {}",
            calls[1]
        );
        // revoke_role succeeds.
        assert_eq!(
            calls[2].get("ok").and_then(Value::as_bool),
            Some(true),
            "revoke_role failed: {}",
            calls[2]
        );
        // After revoke, has_role must be false.
        assert_eq!(
            calls[3].get("ok").and_then(Value::as_bool),
            Some(true),
            "has_role (revoked) failed: {}",
            calls[3]
        );
        assert_eq!(
            calls[3].get("result").and_then(Value::as_bool),
            Some(false),
            "expected has_role == false after revoke, got: {}",
            calls[3]
        );
        // transfer_admin succeeds.
        assert_eq!(
            calls[4].get("ok").and_then(Value::as_bool),
            Some(true),
            "transfer_admin failed: {}",
            calls[4]
        );
        // The new admin can still perform administrative actions.
        assert_eq!(
            calls[5].get("ok").and_then(Value::as_bool),
            Some(true),
            "grant_role (after transfer) failed: {}",
            calls[5]
        );
    }

    #[test]
    fn arbitrary_identity_resolves_generically() {
        // Proves the runner accepts arbitrary identity names once the API
        // supplies them. The API now generates deterministic addresses for
        // novel names (e.g. `governor`); this test stands in for that by
        // supplying `governor` with a valid strkey. The contract deploys with
        // that identity as admin and authorizes calls with it. This is
        // data-driven: there is no component-specific branch for the name.
        // Skips when the wasm artifact is not built (CI's Rust job does not run
        // the Stellar CLI).
        let access_control_wasm = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/wasm32v1-none/release/access_control.wasm"
        );
        if !std::path::Path::new(access_control_wasm).exists() {
            return;
        }
        let request = json!({
            "wasmPath": access_control_wasm,
            "constructorParams": [
                { "name": "admin", "type": "Address" },
            ],
            "constructor": { "admin": "governor" },
            "identities": {
                "governor": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
            },
            "calls": [
                {
                    "fn": "grant_role",
                    "params": [
                        { "name": "role", "type": "Symbol" },
                        { "name": "account", "type": "Address" },
                    ],
                    "args": ["minter", "user1"],
                    "signer": "governor",
                },
                {
                    "fn": "has_role",
                    "params": [
                        { "name": "role", "type": "Symbol" },
                        { "name": "account", "type": "Address" },
                    ],
                    "args": ["minter", "user1"],
                },
            ],
        });
        let response = execute(request);
        assert_eq!(
            response.get("ok").and_then(Value::as_bool),
            Some(true),
            "response was: {}",
            response
        );
        let calls = response.get("calls").and_then(Value::as_array).unwrap();
        assert_eq!(
            calls[0].get("ok").and_then(Value::as_bool),
            Some(true),
            "grant_role failed: {}",
            calls[0]
        );
        assert_eq!(
            calls[1].get("ok").and_then(Value::as_bool),
            Some(true),
            "has_role failed: {}",
            calls[1]
        );
        assert_eq!(
            calls[1].get("result").and_then(Value::as_bool),
            Some(true),
            "expected has_role == true, got: {}",
            calls[1]
        );
    }

    #[test]
    fn multi_signature_executes_generically() {
        // End-to-end boundary for the Multi-signature component's generic
        // support: three NOVEL identities (signer1/2/3, not admin/user1/user2)
        // are supplied by the request, resolved generically by the runner, and
        // drive an M-of-N threshold. Demonstrates the catalog → identity
        // discovery → API → deterministic identities → constructor →
        // sandbox-runner → real wasm → bool-return pipeline with no
        // component-specific branching in the runner.
        // Skips when the wasm artifact is not built (CI's Rust job does not run
        // the Stellar CLI).
        let multi_wasm = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/wasm32v1-none/release/multi_signature.wasm"
        );
        if !std::path::Path::new(multi_wasm).exists() {
            return;
        }
        let env = Env::default();
        use soroban_sdk::testutils::Address as _;
        let s1 = Address::generate(&env);
        let s2 = Address::generate(&env);
        let s3 = Address::generate(&env);
        let strkey = |a: &Address| -> std::string::String {
            std::string::String::from_utf8(a.to_string().to_bytes().to_alloc_vec())
                .unwrap()
        };
        let request = json!({
            "wasmPath": multi_wasm,
            "constructorParams": [
                { "name": "signer1", "type": "Address" },
                { "name": "signer2", "type": "Address" },
                { "name": "signer3", "type": "Address" },
                { "name": "threshold", "type": "u32" },
            ],
            "constructor": {
                "signer1": "signer1",
                "signer2": "signer2",
                "signer3": "signer3",
                "threshold": "2",
            },
            "identities": {
                "signer1": strkey(&s1),
                "signer2": strkey(&s2),
                "signer3": strkey(&s3),
            },
            "calls": [
                {
                    "fn": "approve",
                    "params": [
                        { "name": "signer", "type": "Address" },
                        { "name": "proposal_id", "type": "Symbol" },
                    ],
                    "args": ["signer1", "prop1"],
                    "signer": "signer1",
                },
                {
                    "fn": "approve",
                    "params": [
                        { "name": "signer", "type": "Address" },
                        { "name": "proposal_id", "type": "Symbol" },
                    ],
                    "args": ["signer2", "prop1"],
                    "signer": "signer2",
                },
                {
                    "fn": "is_approved",
                    "params": [{ "name": "proposal_id", "type": "Symbol" }],
                    "args": ["prop1"],
                },
                {
                    "fn": "execute",
                    "params": [{ "name": "proposal_id", "type": "Symbol" }],
                    "args": ["prop1"],
                },
                {
                    "fn": "approve",
                    "params": [
                        { "name": "signer", "type": "Address" },
                        { "name": "proposal_id", "type": "Symbol" },
                    ],
                    "args": ["signer1", "prop1"],
                    "signer": "signer1",
                },
                {
                    "fn": "is_approved",
                    "params": [{ "name": "proposal_id", "type": "Symbol" }],
                    "args": ["prop2"],
                },
            ],
        });
        let response = execute(request);
        assert_eq!(
            response.get("ok").and_then(Value::as_bool),
            Some(true),
            "response was: {}",
            response
        );
        let calls = response.get("calls").and_then(Value::as_array).unwrap();
        assert_eq!(calls.len(), 6);
        // approve signer1 (ok)
        assert_eq!(calls[0].get("ok").and_then(Value::as_bool), Some(true));
        // approve signer2 (ok)
        assert_eq!(calls[1].get("ok").and_then(Value::as_bool), Some(true));
        // is_approved prop1 -> true (threshold reached)
        assert_eq!(calls[2].get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(calls[2].get("result").and_then(Value::as_bool), Some(true));
        // execute prop1 -> true
        assert_eq!(calls[3].get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(calls[3].get("result").and_then(Value::as_bool), Some(true));
        // duplicate approve signer1 (ok, idempotent)
        assert_eq!(calls[4].get("ok").and_then(Value::as_bool), Some(true));
        // is_approved prop2 (no approvals) -> false
        assert_eq!(calls[5].get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(calls[5].get("result").and_then(Value::as_bool), Some(false));
    }

    #[test]
    fn subscription_executes_generically() {
        // End-to-end boundary for the Subscription component's generic support:
        // a subscriber and merchant are supplied by the request, resolved
        // generically by the runner, and drive a time-gated recurring payment.
        // `next_charge` is internal Timepoint state, so no time-specific
        // parameter type is required. The runner cannot advance ledger time, so
        // the time gate is demonstrated by a clean pre-interval failure; the
        // full charge-after-interval success path is covered by the contract's
        // own Rust test suite where ledger time is controllable. Skips when the
        // wasm artifacts are not built (CI's Rust job does not run the Stellar
        // CLI).
        let sub_wasm = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/wasm32v1-none/release/subscription.wasm"
        );
        if !std::path::Path::new(sub_wasm).exists() {
            return;
        }
        let token_wasm = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/wasm32v1-none/release/token.wasm"
        );
        if !std::path::Path::new(token_wasm).exists() {
            return;
        }
        let env = Env::default();
        use soroban_sdk::testutils::Address as _;
        let subscriber = Address::generate(&env);
        let merchant = Address::generate(&env);
        let strkey = |a: &Address| -> std::string::String {
            std::string::String::from_utf8(a.to_string().to_bytes().to_alloc_vec())
                .unwrap()
        };
        let request = json!({
            "wasmPath": sub_wasm,
            "constructorParams": [
                { "name": "subscriber", "type": "Address" },
                { "name": "merchant", "type": "Address" },
                { "name": "asset", "type": "Address" },
                { "name": "amount", "type": "i128" },
                { "name": "interval", "type": "u32" },
            ],
            "constructor": {
                "subscriber": "subscriber",
                "merchant": "merchant",
                "asset": "asset",
                "amount": "1000",
                "interval": "3600",
            },
            "identities": {
                "subscriber": strkey(&subscriber),
                "merchant": strkey(&merchant),
            },
            "dependencies": [
                {
                    "alias": "asset",
                    "wasmPath": token_wasm,
                    "constructorParams": [
                        { "name": "admin", "type": "Address" },
                        { "name": "decimal", "type": "u32" },
                        { "name": "name", "type": "String" },
                        { "name": "symbol", "type": "String" },
                    ],
                    "constructor": {
                        "admin": "admin",
                        "decimal": "7",
                        "name": "Subscription Asset",
                        "symbol": "SUB",
                    },
                    "setup": [
                        {
                            "fn": "mint",
                            "params": [
                                { "name": "to", "type": "Address" },
                                { "name": "amount", "type": "i128" },
                            ],
                            "args": ["admin", "1000000"],
                            "signer": "admin",
                        }
                    ],
                }
            ],
            "calls": [
                {
                    "fn": "charge",
                    "params": [{ "name": "subscriber", "type": "Address" }],
                    "args": ["subscriber"],
                    "signer": "subscriber",
                },
                {
                    "fn": "cancel",
                    "params": [{ "name": "subscriber", "type": "Address" }],
                    "args": ["subscriber"],
                    "signer": "subscriber",
                },
                {
                    "fn": "is_active",
                    "params": [],
                    "args": [],
                },
                {
                    "fn": "charge",
                    "params": [{ "name": "subscriber", "type": "Address" }],
                    "args": ["subscriber"],
                    "signer": "subscriber",
                },
            ],
        });
        let response = execute(request);
        assert_eq!(
            response.get("ok").and_then(Value::as_bool),
            Some(true),
            "response was: {}",
            response
        );
        let calls = response.get("calls").and_then(Value::as_array).unwrap();
        assert_eq!(calls.len(), 4);
        // charge before interval: time gate not reached -> ok, but result false
        assert_eq!(calls[0].get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(
            calls[0].get("result").and_then(Value::as_bool),
            Some(false)
        );
        // cancel: succeeds
        assert_eq!(calls[1].get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(
            calls[1].get("result").and_then(Value::as_bool),
            Some(true)
        );
        // is_active after cancel: false
        assert_eq!(calls[2].get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(
            calls[2].get("result").and_then(Value::as_bool),
            Some(false)
        );
        // charge after cancel: inactive -> false
        assert_eq!(calls[3].get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(
            calls[3].get("result").and_then(Value::as_bool),
            Some(false)
        );
    }

    #[test]
    fn vesting_executes_generically() {
        // End-to-end boundary for the Vesting component's generic support:
        //   Vesting -> asset dependency (alias "asset") -> dependency
        //   provisioning -> Vesting deployment (asset passed into the
        //   constructor) -> deposit (first-address funding) -> time-gated claim.
        // The contract custodies the asset and releases it linearly from an
        // internal Timepoint schedule; no Vesting-specific runner code exists.
        // The runner cannot advance ledger time, so the pre-cliff state is
        // demonstrated (claim returns 0); the full timeline is covered by the
        // contract's own Rust test suite. Skips when the wasm artifacts are not
        // built (CI's Rust job does not run the Stellar CLI).
        let vesting_wasm = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/wasm32v1-none/release/vesting.wasm"
        );
        if !std::path::Path::new(vesting_wasm).exists() {
            return;
        }
        let token_wasm = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/wasm32v1-none/release/token.wasm"
        );
        if !std::path::Path::new(token_wasm).exists() {
            return;
        }
        let env = Env::default();
        use soroban_sdk::testutils::Address as _;
        let admin = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let intruder = Address::generate(&env);
        let strkey = |a: &Address| -> std::string::String {
            std::string::String::from_utf8(a.to_string().to_bytes().to_alloc_vec()).unwrap()
        };
        let request = json!({
            "wasmPath": vesting_wasm,
            "constructorParams": [
                { "name": "beneficiary", "type": "Address" },
                { "name": "asset", "type": "Address" },
                { "name": "total", "type": "i128" },
                { "name": "start", "type": "u32" },
                { "name": "duration", "type": "u32" },
                { "name": "cliff", "type": "u32" },
            ],
            "constructor": {
                "beneficiary": "beneficiary",
                "asset": "asset",
                "total": "1000000",
                "start": "0",
                "duration": "86400",
                "cliff": "3600",
            },
            "identities": {
                "admin": strkey(&admin),
                "beneficiary": strkey(&beneficiary),
                "intruder": strkey(&intruder),
            },
            "dependencies": [
                {
                    "alias": "asset",
                    "wasmPath": token_wasm,
                    "constructorParams": [
                        { "name": "admin", "type": "Address" },
                        { "name": "decimal", "type": "u32" },
                        { "name": "name", "type": "String" },
                        { "name": "symbol", "type": "String" },
                    ],
                    "constructor": {
                        "admin": "admin",
                        "decimal": "7",
                        "name": "Vesting Asset",
                        "symbol": "VEST",
                    },
                    "setup": [
                        {
                            "fn": "mint",
                            "params": [
                                { "name": "to", "type": "Address" },
                                { "name": "amount", "type": "i128" },
                            ],
                            "args": ["admin", "1000000"],
                            "signer": "admin",
                        }
                    ],
                }
            ],
            "calls": [
                {
                    "fn": "deposit",
                    "params": [
                        { "name": "from", "type": "Address" },
                        { "name": "amount", "type": "i128" },
                    ],
                    "args": ["admin", "1000000"],
                    "signer": "admin",
                },
                {
                    "fn": "claimable",
                    "params": [],
                    "args": [],
                },
                {
                    "fn": "released",
                    "params": [],
                    "args": [],
                },
                {
                    "fn": "claim",
                    "params": [{ "name": "beneficiary", "type": "Address" }],
                    "args": ["beneficiary"],
                    "signer": "beneficiary",
                },
                {
                    "fn": "claim",
                    "params": [{ "name": "beneficiary", "type": "Address" }],
                    "args": ["intruder"],
                    "signer": "intruder",
                },
            ],
        });
        let response = execute(request);
        assert_eq!(
            response.get("ok").and_then(Value::as_bool),
            Some(true),
            "response was: {}",
            response
        );
        let calls = response.get("calls").and_then(Value::as_array).unwrap();
        assert_eq!(calls.len(), 5);
        // deposit: funded the contract.
        assert_eq!(calls[0].get("ok").and_then(Value::as_bool), Some(true));
        // claimable before cliff: 0.
        assert_eq!(calls[1].get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(
            calls[1].get("result").and_then(Value::as_i64),
            Some(0)
        );
        // released before any claim: 0.
        assert_eq!(calls[2].get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(
            calls[2].get("result").and_then(Value::as_i64),
            Some(0)
        );
        // claim by the beneficiary before cliff: returns 0 (no transfer).
        assert_eq!(calls[3].get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(
            calls[3].get("result").and_then(Value::as_i64),
            Some(0)
        );
        // claim by an intruder: rejected by the stored-beneficiary check.
        assert_eq!(calls[4].get("ok").and_then(Value::as_bool), Some(false));
    }

    #[test]
    fn staking_executes_generically() {
        // End-to-end boundary for the Staking component's generic support:
        //   Staking -> asset dependency (alias "asset") -> dependency
        //   provisioning -> Staking deployment (asset passed into the
        //   constructor) -> fund_rewards (admin) -> stake/unstake/claim
        //   (first-address). Exercises the reward-per-token accounting end to
        //   end: staking moves the asset in and tracks balances, and the
        //   contract is driven with no Staking-specific branching in the runner.
        // The runner cannot advance ledger time, so reward accrual is
        // demonstrated by a clean zero-earned pre-time state (the full timeline
        // is covered by the contract's own Rust test suite). Skips when the wasm
        // artifacts are not built (CI's Rust job does not run the Stellar CLI).
        let staking_wasm = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/wasm32v1-none/release/staking.wasm"
        );
        if !std::path::Path::new(staking_wasm).exists() {
            return;
        }
        let token_wasm = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/wasm32v1-none/release/token.wasm"
        );
        if !std::path::Path::new(token_wasm).exists() {
            return;
        }
        let env = Env::default();
        use soroban_sdk::testutils::Address as _;
        let admin = Address::generate(&env);
        let user1 = Address::generate(&env);
        let strkey = |a: &Address| -> std::string::String {
            std::string::String::from_utf8(a.to_string().to_bytes().to_alloc_vec()).unwrap()
        };
        let request = json!({
            "wasmPath": staking_wasm,
            "constructorParams": [
                { "name": "asset", "type": "Address" },
                { "name": "duration", "type": "u32" },
            ],
            "constructor": {
                "asset": "asset",
                "duration": "86400",
            },
            "identities": {
                "admin": strkey(&admin),
                "user1": strkey(&user1),
            },
            "dependencies": [
                {
                    "alias": "asset",
                    "wasmPath": token_wasm,
                    "constructorParams": [
                        { "name": "admin", "type": "Address" },
                        { "name": "decimal", "type": "u32" },
                        { "name": "name", "type": "String" },
                        { "name": "symbol", "type": "String" },
                    ],
                    "constructor": {
                        "admin": "admin",
                        "decimal": "7",
                        "name": "Staking Asset",
                        "symbol": "STK",
                    },
                    "setup": [
                        {
                            "fn": "mint",
                            "params": [
                                { "name": "to", "type": "Address" },
                                { "name": "amount", "type": "i128" },
                            ],
                            "args": ["admin", "1000000"],
                            "signer": "admin",
                        },
                        {
                            "fn": "mint",
                            "params": [
                                { "name": "to", "type": "Address" },
                                { "name": "amount", "type": "i128" },
                            ],
                            "args": ["user1", "1000000"],
                            "signer": "admin",
                        }
                    ],
                }
            ],
            "calls": [
                {
                    "fn": "fund_rewards",
                    "params": [
                        { "name": "from", "type": "Address" },
                        { "name": "amount", "type": "i128" },
                    ],
                    "args": ["admin", "500000"],
                    "signer": "admin",
                },
                {
                    "fn": "stake",
                    "params": [
                        { "name": "from", "type": "Address" },
                        { "name": "amount", "type": "i128" },
                    ],
                    "args": ["user1", "100000"],
                    "signer": "user1",
                },
                {
                    "fn": "staked_balance",
                    "params": [{ "name": "of", "type": "Address" }],
                    "args": ["user1"],
                },
                {
                    "fn": "total_staked",
                    "params": [],
                    "args": [],
                },
                {
                    "fn": "earned",
                    "params": [{ "name": "of", "type": "Address" }],
                    "args": ["user1"],
                },
                {
                    "fn": "unstake",
                    "params": [
                        { "name": "from", "type": "Address" },
                        { "name": "amount", "type": "i128" },
                    ],
                    "args": ["user1", "50000"],
                    "signer": "user1",
                },
                {
                    "fn": "staked_balance",
                    "params": [{ "name": "of", "type": "Address" }],
                    "args": ["user1"],
                },
                {
                    "fn": "claim",
                    "params": [{ "name": "from", "type": "Address" }],
                    "args": ["user1"],
                    "signer": "user1",
                },
            ],
        });
        let response = execute(request);
        assert_eq!(
            response.get("ok").and_then(Value::as_bool),
            Some(true),
            "response was: {}",
            response
        );
        let deps = response
            .get("deployedDependencies")
            .and_then(Value::as_array)
            .expect("response includes deployedDependencies");
        assert_eq!(deps.len(), 1);
        assert_eq!(deps[0].get("alias").and_then(Value::as_str), Some("asset"));
        let calls = response.get("calls").and_then(Value::as_array).unwrap();
        assert_eq!(calls.len(), 8);
        // fund_rewards: succeeded.
        assert_eq!(calls[0].get("ok").and_then(Value::as_bool), Some(true));
        // stake: succeeded.
        assert_eq!(calls[1].get("ok").and_then(Value::as_bool), Some(true));
        // staked_balance(user1): 100000 after staking.
        assert_eq!(calls[2].get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(
            calls[2].get("result").and_then(Value::as_i64),
            Some(100000)
        );
        // total_staked: 100000.
        assert_eq!(calls[3].get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(
            calls[3].get("result").and_then(Value::as_i64),
            Some(100000)
        );
        // earned(user1): 0 before any ledger time advances.
        assert_eq!(calls[4].get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(calls[4].get("result").and_then(Value::as_i64), Some(0));
        // unstake(user1, 50000): succeeded.
        assert_eq!(calls[5].get("ok").and_then(Value::as_bool), Some(true));
        // staked_balance(user1): 50000 after partial unstake.
        assert_eq!(calls[6].get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(
            calls[6].get("result").and_then(Value::as_i64),
            Some(50000)
        );
        // claim(user1): 0 rewards before any time passes.
        assert_eq!(calls[7].get("ok").and_then(Value::as_bool), Some(true));
        assert_eq!(calls[7].get("result").and_then(Value::as_i64), Some(0));
    }
}