#![no_std]

//! Escrow is a small stateful holding contract.
//!
//! It locks a SEP-41 asset between a `depositor` and a `beneficiary` and only
//! lets the `arbiter` move the held funds, either to the beneficiary
//! (`release`) or back to the depositor (`refund`). The asset itself lives in a
//! separate SEP-41 contract; Escrow simply delegates balance movement to it,
//! exactly like the Payment primitive does.

use soroban_sdk::{
    contract, contractimpl, contracttype,
    token::TokenClient,
    Address, Env, Symbol,
};

#[contract]
pub struct Escrow;

#[derive(Clone)]
#[contracttype]
pub enum State {
    Active,
    Released,
    Refunded,
}

#[contractimpl]
impl Escrow {
    /// Locks the escrow to a depositor, beneficiary, and arbiter, holding the
    /// given SEP-41 `asset`. The constructor takes no auth (deployment is
    /// mocked by the deployer, like every other component).
    pub fn __constructor(
        e: &Env,
        depositor: Address,
        beneficiary: Address,
        arbiter: Address,
        asset: Address,
    ) {
        e.storage()
            .instance()
            .set(&Symbol::new(e, "depositor"), &depositor);
        e.storage()
            .instance()
            .set(&Symbol::new(e, "beneficiary"), &beneficiary);
        e.storage()
            .instance()
            .set(&Symbol::new(e, "arbiter"), &arbiter);
        e.storage().instance().set(&Symbol::new(e, "asset"), &asset);
        e.storage().instance().set(&Symbol::new(e, "amount"), &0i128);
        e.storage()
            .instance()
            .set(&Symbol::new(e, "state"), &State::Active);
    }

    fn depositor(e: &Env) -> Address {
        e.storage()
            .instance()
            .get(&Symbol::new(e, "depositor"))
            .unwrap()
    }

    fn beneficiary(e: &Env) -> Address {
        e.storage()
            .instance()
            .get(&Symbol::new(e, "beneficiary"))
            .unwrap()
    }

    fn arbiter(e: &Env) -> Address {
        e.storage()
            .instance()
            .get(&Symbol::new(e, "arbiter"))
            .unwrap()
    }

    fn asset(e: &Env) -> Address {
        e.storage()
            .instance()
            .get(&Symbol::new(e, "asset"))
            .unwrap()
    }

    fn held(e: &Env) -> i128 {
        e.storage().instance().get(&Symbol::new(e, "amount")).unwrap()
    }

    fn state(e: &Env) -> State {
        e.storage()
            .instance()
            .get(&Symbol::new(e, "state"))
            .unwrap()
    }

    /// Moves `amount` of the held asset from the `depositor` into the contract.
    /// Authorized by the depositor. Rejects non-positive amounts and any call
    /// after the escrow has been released or refunded.
    pub fn deposit(e: &Env, depositor: Address, amount: i128) {
        if amount <= 0 {
            panic!("deposit amount must be positive");
        }
        if depositor != Self::depositor(e) {
            panic!("deposit must be called by the depositor");
        }
        depositor.require_auth();
        match Self::state(e) {
            State::Active => {}
            _ => panic!("escrow is already closed"),
        }
        let asset = Self::asset(e);
        let token = TokenClient::new(e, &asset);
        token.transfer(
            &depositor,
            &e.current_contract_address(),
            &amount,
        );
        let new_held = Self::held(e) + amount;
        e.storage()
            .instance()
            .set(&Symbol::new(e, "amount"), &new_held);
    }

    /// Releases the held asset to the beneficiary. Authorized by the arbiter.
    /// Rejects calls from a non-arbiter, double releases, and releases with
    /// nothing held.
    pub fn release(e: &Env, arbiter: Address) {
        if arbiter != Self::arbiter(e) {
            panic!("release must be called by the arbiter");
        }
        arbiter.require_auth();
        match Self::state(e) {
            State::Active => {}
            _ => panic!("escrow is already closed"),
        }
        let amount = Self::held(e);
        if amount <= 0 {
            panic!("nothing to release");
        }
        let asset = Self::asset(e);
        let token = TokenClient::new(e, &asset);
        token.transfer(
            &e.current_contract_address(),
            &Self::beneficiary(e),
            &amount,
        );
        e.storage()
            .instance()
            .set(&Symbol::new(e, "state"), &State::Released);
        e.storage().instance().set(&Symbol::new(e, "amount"), &0i128);
    }

    /// Returns the held asset to the depositor. Authorized by the arbiter.
    /// Mirrors the release guards.
    pub fn refund(e: &Env, arbiter: Address) {
        if arbiter != Self::arbiter(e) {
            panic!("refund must be called by the arbiter");
        }
        arbiter.require_auth();
        match Self::state(e) {
            State::Active => {}
            _ => panic!("escrow is already closed"),
        }
        let amount = Self::held(e);
        if amount <= 0 {
            panic!("nothing to refund");
        }
        let asset = Self::asset(e);
        let token = TokenClient::new(e, &asset);
        token.transfer(
            &e.current_contract_address(),
            &Self::depositor(e),
            &amount,
        );
        e.storage()
            .instance()
            .set(&Symbol::new(e, "state"), &State::Refunded);
        e.storage().instance().set(&Symbol::new(e, "amount"), &0i128);
    }

    /// Returns the escrow state: 0 = active, 1 = released, 2 = refunded.
    pub fn status(e: &Env) -> u32 {
        match Self::state(e) {
            State::Active => 0,
            State::Released => 1,
            State::Refunded => 2,
        }
    }
}

#[cfg(test)]
mod test;
