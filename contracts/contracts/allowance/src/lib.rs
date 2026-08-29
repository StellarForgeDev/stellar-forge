#![no_std]

//! Allowance — a delegated spending manager.
//!
//! The contract records spending allowances granted by a token holder
//! (`owner`) to a `spender`, keyed per `asset` (any SEP-41 token). A spender
//! can then move tokens from the owner to a recipient, up to the remaining
//! allowance, by invoking `transfer_from`.
//!
//! The manager is the sole spending authority: when an owner grants or adjusts
//! an allowance, the manager also approves ITSELF on the underlying token up to
//! that amount. `transfer_from` then pulls from the token using the manager's
//! own address, while the manager's per-spender ledger enforces the policy
//! limit. A spender cannot bypass the manager, because the token allowance is
//! granted to the manager contract, not to the spender.

use soroban_sdk::{
    contract, contractimpl,
    token::Client as TokenClient,
    Address, Env,
};

#[contract]
pub struct AllowanceManager;

#[contractimpl]
impl AllowanceManager {
    /// Stateless init. The manager stores allowances per (owner, asset,
    /// spender), so the constructor takes no arguments.
    pub fn __constructor(_e: &Env) {}

    /// Grant `spender` the right to spend `amount` of `asset` from `owner`'s
    /// balance, replacing any prior allowance for the same tuple. Also approves
    /// the manager on the token so it can pull on the owner's behalf.
    ///
    /// Authorization: `owner` must authorize.
    pub fn approve(e: &Env, owner: Address, asset: Address, spender: Address, amount: i128) {
        if amount < 0 {
            panic!("allowance amount must be non-negative");
        }
        owner.require_auth();
        let key = allowance_key(&owner, &asset, &spender);
        e.storage().persistent().set(&key, &amount);
        sync_token_allowance(e, &asset, &owner, amount);
    }

    /// Increase the existing allowance (defaults to 0) by `amount`, keeping the
    /// token-level allowance to the manager in sync.
    pub fn increase_allowance(
        e: &Env,
        owner: Address,
        asset: Address,
        spender: Address,
        amount: i128,
    ) {
        if amount < 0 {
            panic!("allowance amount must be non-negative");
        }
        owner.require_auth();
        let key = allowance_key(&owner, &asset, &spender);
        let current = e.storage().persistent().get::<_, i128>(&key).unwrap_or(0);
        let next = current + amount;
        e.storage().persistent().set(&key, &next);
        sync_token_allowance(e, &asset, &owner, next);
    }

    /// Decrease the existing allowance by `amount` (never below 0), keeping the
    /// token-level allowance to the manager in sync.
    pub fn decrease_allowance(
        e: &Env,
        owner: Address,
        asset: Address,
        spender: Address,
        amount: i128,
    ) {
        if amount < 0 {
            panic!("allowance amount must be non-negative");
        }
        owner.require_auth();
        let key = allowance_key(&owner, &asset, &spender);
        let current = e.storage().persistent().get::<_, i128>(&key).unwrap_or(0);
        let next = current - amount;
        if next < 0 {
            panic!("allowance would underflow");
        }
        e.storage().persistent().set(&key, &next);
        sync_token_allowance(e, &asset, &owner, next);
    }

    /// Return the remaining allowance `spender` may spend of `asset` from `owner`.
    pub fn allowance(e: &Env, owner: Address, asset: Address, spender: Address) -> i128 {
        let key = allowance_key(&owner, &asset, &spender);
        e.storage().persistent().get::<_, i128>(&key).unwrap_or(0)
    }

    /// Spend `amount` of `asset` from `from` to `to` on behalf of `spender`,
    /// debiting `spender`'s remaining allowance.
    ///
    /// Authorization: `spender` must authorize.
    /// Errors: a negative `amount` is rejected; an allowance shortfall panics;
    /// any failure from the underlying token transfer propagates unchanged.
    pub fn transfer_from(
        e: &Env,
        spender: Address,
        asset: Address,
        from: Address,
        to: Address,
        amount: i128,
    ) {
        if amount < 0 {
            panic!("allowance spend must be non-negative");
        }
        spender.require_auth();
        let key = allowance_key(&from, &asset, &spender);
        let remaining = e.storage().persistent().get::<_, i128>(&key).unwrap_or(0);
        if remaining < amount {
            panic!("allowance exceeded");
        }
        e.storage().persistent().set(&key, &(remaining - amount));
        // The manager pulls from the token on the owner's behalf, using its own
        // address as the spender (the owner pre-approved the manager on the
        // token via `sync_token_allowance`). Contract-to-contract invocation
        // authorizes the manager address automatically.
        let manager = e.current_contract_address();
        let client = TokenClient::new(e, &asset);
        client.transfer_from(&manager, &from, &to, &amount);
    }
}

fn allowance_key(owner: &Address, asset: &Address, spender: &Address) -> (Address, Address, Address) {
    (owner.clone(), asset.clone(), spender.clone())
}

/// Keep the token-level allowance to the manager contract equal to the policy
/// limit for (owner, asset). The owner's auth propagates from the calling
/// manager method into this nested token call.
fn sync_token_allowance(e: &Env, asset: &Address, owner: &Address, amount: i128) {
    let manager = e.current_contract_address();
    // The underlying token stores its allowance with a bounded TTL, so the
    // horizon must stay under the network maximum (~6.3M ledgers). Tie it to
    // the current ledger with a long offset; normal usage re-syncs on every
    // grant/adjust, keeping it fresh.
    let live_until_ledger = e.ledger().sequence().saturating_add(5_000_000);
    let client = TokenClient::new(e, asset);
    client.approve(owner, &manager, &amount, &live_until_ledger);
}

#[cfg(test)]
mod test;
