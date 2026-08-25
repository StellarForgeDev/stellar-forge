#![no_std]

use soroban_sdk::{contract, contractimpl, token::TokenClient, Address, Env};

/// Payment is a thin, stateless payment primitive.
///
/// It does not hold any state of its own. A payment is simply a transfer of a
/// SEP-41 compatible asset (`asset`) from a sender (`from`) to a recipient
/// (`to`). The balance movement happens in the asset contract, which Payment
/// invokes on behalf of the sender.
#[contract]
pub struct Payment;

#[contractimpl]
impl Payment {
    /// Stateless init. Payment stores nothing, so the constructor takes no
    /// arguments.
    pub fn __constructor(_e: &Env) {}

    /// Move `amount` of `asset` from `from` to `to`.
    ///
    /// Authorization: `from` must authorize the call.
    /// Errors: a negative `amount` is rejected; any failure from the underlying
    /// asset transfer (e.g. insufficient balance) propagates unchanged.
    pub fn pay(e: &Env, from: Address, to: Address, asset: Address, amount: i128) {
        if amount < 0 {
            panic!("negative amount is not allowed: {}", amount);
        }

        from.require_auth();

        let token = TokenClient::new(e, &asset);
        token.transfer(&from, &to, &amount);
    }
}

#[cfg(test)]
mod test;
