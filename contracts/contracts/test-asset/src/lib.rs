#![no_std]

//! A minimal SEP-41-compatible asset used as test/sandbox infrastructure for the
//! Payment component. It is NOT a Stellar-Forge catalog component and is not
//! deployed as a product. It exists so Payment can be exercised against a real
//! contract that implements `TokenInterface` without depending on (or modifying)
//! the production `token` component.

use soroban_sdk::{
    contract, contractimpl,
    token::TokenInterface,
    Address, Env, Map, MuxedAddress, String, Symbol,
};

#[contract]
pub struct TestAsset;

#[contractimpl]
impl TestAsset {
    pub fn __constructor(
        e: &Env,
        admin: Address,
        _decimal: u32,
        _name: String,
        _symbol: String,
    ) {
        e.storage().instance().set(&Symbol::new(e, "admin"), &admin);
    }

    pub fn mint(e: &Env, to: Address, amount: i128) {
        let admin: Address = e.storage().instance().get(&Symbol::new(e, "admin")).unwrap();
        admin.require_auth();
        let mut balances = Self::balances(e);
        let current = balances.get(to.clone()).unwrap_or(0);
        balances.set(to, current + amount);
        e.storage().instance().set(&Symbol::new(e, "balances"), &balances);
    }

    fn balances(e: &Env) -> Map<Address, i128> {
        e.storage()
            .instance()
            .get(&Symbol::new(e, "balances"))
            .unwrap_or_else(|| Map::new(e))
    }
}

#[contractimpl(contracttrait)]
impl TokenInterface for TestAsset {
    fn allowance(_e: Env, _from: Address, _spender: Address) -> i128 {
        0
    }

    fn approve(_e: Env, _from: Address, _spender: Address, _amount: i128, _live: u32) {}

    fn balance(e: Env, id: Address) -> i128 {
        Self::balances(&e).get(id).unwrap_or(0)
    }

    fn transfer(e: Env, from: Address, to: MuxedAddress, amount: i128) {
        from.require_auth();
        let recipient = to.address();
        let mut balances = Self::balances(&e);
        let from_balance = balances.get(from.clone()).unwrap_or(0);
        if from_balance < amount {
            panic!("insufficient balance");
        }
        let to_balance = balances.get(recipient.clone()).unwrap_or(0);
        balances.set(from, from_balance - amount);
        balances.set(recipient, to_balance + amount);
        e.storage().instance().set(&Symbol::new(&e, "balances"), &balances);
    }

    fn transfer_from(_e: Env, _spender: Address, _from: Address, _to: Address, _amount: i128) {}

    fn burn(_e: Env, _from: Address, _amount: i128) {}

    fn burn_from(_e: Env, _spender: Address, _from: Address, _amount: i128) {}

    fn decimals(_e: Env) -> u32 {
        7
    }

    fn name(e: Env) -> String {
        e.storage()
            .instance()
            .get(&Symbol::new(&e, "name"))
            .unwrap_or_else(|| String::from_str(&e, "Test Asset"))
    }

    fn symbol(e: Env) -> String {
        e.storage()
            .instance()
            .get(&Symbol::new(&e, "symbol"))
            .unwrap_or_else(|| String::from_str(&e, "AST"))
    }
}
