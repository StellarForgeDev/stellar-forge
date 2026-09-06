#![no_std]

//! A minimal contract used to exercise the generic sandbox-runner in tests.
//!
//! This is a fixture only: it is intentionally NOT registered in the catalog
//! (`src/data/components.ts`) and is not part of the product surface. It exists
//! so the runner can be verified against a contract other than the token that
//! uses the same supported parameter/return types (Address, String, u32, i128,
//! Symbol) plus admin authorization.

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Symbol};

#[contract]
pub struct Greeter;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Greeting,
    Count,
}

#[contractimpl]
impl Greeter {
    pub fn __constructor(env: Env, admin: Address, greeting: String, count: u32) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Greeting, &greeting);
        env.storage().instance().set(&DataKey::Count, &count);
    }

    pub fn greet(env: Env) -> String {
        env.storage().instance().get(&DataKey::Greeting).unwrap()
    }

    pub fn set_greeting(env: Env, greeting: String) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::Greeting, &greeting);
    }

    pub fn count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap()
    }

    pub fn increment(env: Env, by: u32) -> u32 {
        let count: u32 = env.storage().instance().get(&DataKey::Count).unwrap();
        let next = count.checked_add(by).unwrap();
        env.storage().instance().set(&DataKey::Count, &next);
        next
    }

    pub fn tag(_env: Env, tag: Symbol) -> Symbol {
        tag
    }
}
