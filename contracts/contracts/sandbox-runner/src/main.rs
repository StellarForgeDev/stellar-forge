use std::collections::HashMap;
use std::io::Read;
use std::panic::{catch_unwind, AssertUnwindSafe};

use serde_json::{json, Value};
use soroban_sdk::{
    testutils::{MockAuth, MockAuthInvoke},
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

    if let Some(signer) = call.get("signer").and_then(Value::as_str) {
        let address = match resolve_address(env, identities, signer) {
            Ok(address) => address,
            Err(e) => return call_error(Some(fn_name), e),
        };
        env.mock_auths(&[MockAuth {
            address: &address,
            invoke: &MockAuthInvoke {
                contract,
                fn_name,
                args: arg_vals.clone(),
                sub_invokes: &[],
            },
        }]);
    }

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
}