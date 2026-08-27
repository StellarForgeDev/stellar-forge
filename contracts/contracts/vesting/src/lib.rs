#![no_std]

//! Vesting is a small stateful holding contract.
//!
//! It custodies a SEP-41 `asset` on behalf of a single `beneficiary` and
//! releases the balance linearly over a time window that begins `start` seconds
//! after deployment, with an initial `cliff` after which vesting begins, and a
//! `duration` over which the full `total` is released. The asset lives in a
//! separate SEP-41 contract; Vesting delegates balance movement to it, exactly
//! like the Escrow and Payment components do.

use soroban_sdk::{
    contract, contractimpl,
    token::TokenClient,
    Address, Env, Symbol, Timepoint,
};

const BENEFICIARY: &str = "beneficiary";
const ASSET: &str = "asset";
const TOTAL: &str = "total";
const START: &str = "start";
const CLIFF: &str = "cliff";
const END: &str = "end";
const RELEASED: &str = "released";

#[contract]
pub struct Vesting;

#[contractimpl]
impl Vesting {
    /// Configures the vesting schedule. `start`, `duration`, and `cliff` are
    /// `u32` seconds: `start` is relative to deployment time, while `cliff` and
    /// `duration` are relative to `start`. The constructor takes no auth
    /// (deployment is mocked by the deployer, like every other component).
    ///
    /// Panics if `duration` is zero or if `cliff` exceeds `duration`.
    pub fn __constructor(
        e: &Env,
        beneficiary: Address,
        asset: Address,
        total: i128,
        start: u32,
        duration: u32,
        cliff: u32,
    ) {
        if duration == 0 {
            panic!("duration must be greater than zero");
        }
        if cliff > duration {
            panic!("cliff must not exceed duration");
        }
        let now = e.ledger().timestamp();
        let start_time = Timepoint::from_unix(e, now + start as u64);
        let cliff_time = Timepoint::from_unix(e, start_time.to_unix() + cliff as u64);
        let end_time = Timepoint::from_unix(e, start_time.to_unix() + duration as u64);
        e.storage()
            .instance()
            .set(&Symbol::new(e, BENEFICIARY), &beneficiary);
        e.storage().instance().set(&Symbol::new(e, ASSET), &asset);
        e.storage().instance().set(&Symbol::new(e, TOTAL), &total);
        e.storage()
            .instance()
            .set(&Symbol::new(e, START), &start_time);
        e.storage()
            .instance()
            .set(&Symbol::new(e, CLIFF), &cliff_time);
        e.storage()
            .instance()
            .set(&Symbol::new(e, END), &end_time);
        e.storage().instance().set(&Symbol::new(e, RELEASED), &0i128);
    }

    fn beneficiary(e: &Env) -> Address {
        e.storage()
            .instance()
            .get(&Symbol::new(e, BENEFICIARY))
            .unwrap()
    }

    fn asset(e: &Env) -> Address {
        e.storage()
            .instance()
            .get(&Symbol::new(e, ASSET))
            .unwrap()
    }

    fn total(e: &Env) -> i128 {
        e.storage()
            .instance()
            .get(&Symbol::new(e, TOTAL))
            .unwrap()
    }

    fn start_time(e: &Env) -> Timepoint {
        e.storage()
            .instance()
            .get(&Symbol::new(e, START))
            .unwrap()
    }

    fn cliff_time(e: &Env) -> Timepoint {
        e.storage()
            .instance()
            .get(&Symbol::new(e, CLIFF))
            .unwrap()
    }

    fn end_time(e: &Env) -> Timepoint {
        e.storage()
            .instance()
            .get(&Symbol::new(e, END))
            .unwrap()
    }

    fn released_amount(e: &Env) -> i128 {
        e.storage()
            .instance()
            .get(&Symbol::new(e, RELEASED))
            .unwrap()
    }

    fn set_released_amount(e: &Env, amount: i128) {
        e.storage()
            .instance()
            .set(&Symbol::new(e, RELEASED), &amount);
    }

    /// Funds the contract. Moves `amount` of the held asset from `from` into the
    /// contract. Authorized by `from` (`first-address`). The deployer is expected
    /// to deposit the `total` (typically minted to an admin by the token
    /// dependency's setup step) before claims begin.
    pub fn deposit(e: &Env, from: Address, amount: i128) {
        if amount <= 0 {
            panic!("deposit amount must be positive");
        }
        from.require_auth();
        let token = TokenClient::new(e, &Self::asset(e));
        token.transfer(&from, &e.current_contract_address(), &amount);
    }

    /// Releases the currently vested (and unclaimed) amount to the beneficiary.
    /// Authorized by the beneficiary (`first-address`). Returns the amount
    /// transferred; returns 0 before the cliff or when nothing is vested.
    pub fn claim(e: &Env, beneficiary: Address) -> i128 {
        if beneficiary != Self::beneficiary(e) {
            panic!("claim must be called by the beneficiary");
        }
        beneficiary.require_auth();
        let amount = Self::claimable(e);
        if amount > 0 {
            let token = TokenClient::new(e, &Self::asset(e));
            token.transfer(&e.current_contract_address(), &beneficiary, &amount);
            Self::set_released_amount(e, Self::released_amount(e) + amount);
        }
        amount
    }

    /// Reports the amount currently vested and not yet claimed, based on the
    /// ledger time. `none` authorization.
    pub fn claimable(e: &Env) -> i128 {
        let now = e.ledger().timestamp();
        if now < Self::cliff_time(e).to_unix() {
            return 0;
        }
        let total = Self::total(e);
        if now >= Self::end_time(e).to_unix() {
            return total - Self::released_amount(e);
        }
        let elapsed = (now - Self::start_time(e).to_unix()) as i128;
        let span = (Self::end_time(e).to_unix() - Self::start_time(e).to_unix()) as i128;
        let vested = total * elapsed / span;
        vested - Self::released_amount(e)
    }

    /// Reports the total amount already claimed by the beneficiary. `none`
    /// authorization.
    pub fn released(e: &Env) -> i128 {
        Self::released_amount(e)
    }
}

#[cfg(test)]
mod test;
