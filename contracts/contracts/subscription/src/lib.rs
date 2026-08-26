#![no_std]

//! Subscription is a minimal recurring-payment component.
//!
//! It records a subscriber, a merchant, the subscribed asset, a fixed payment
//! amount, and a charge interval (in seconds). Charges are time-gated: a charge
//! only succeeds once the ledger time has reached the contract's internal
//! `next_charge` `Timepoint`, after which the schedule advances by `interval`.
//!
//! The component fits the generic Component Ecosystem pipeline with no
//! component-specific platform branching. Crucially, time stays internal
//! contract state: `next_charge` is a Soroban `Timepoint`, but it never enters
//! or leaves as a platform parameter type, so no F2 type expansion is needed.

use soroban_sdk::{
    contract, contractimpl,
    token::TokenClient,
    Address, Env, Symbol, Timepoint,
};

const SUBSCRIBER: &str = "subscriber";
const MERCHANT: &str = "merchant";
const ASSET: &str = "asset";
const AMOUNT: &str = "amount";
const INTERVAL: &str = "interval";
const NEXT_CHARGE: &str = "next_charge";
const ACTIVE: &str = "active";

#[contract]
pub struct Subscription;

#[contractimpl]
impl Subscription {
    /// Configures the recurring-payment agreement. `next_charge` is derived
    /// internally from the current ledger time plus `interval`; the time value
    /// never crosses the platform parameter boundary.
    pub fn __constructor(
        e: &Env,
        subscriber: Address,
        merchant: Address,
        asset: Address,
        amount: i128,
        interval: u32,
    ) {
        let now = e.ledger().timestamp();
        let next_charge = Timepoint::from_unix(e, now + interval as u64);
        e.storage().instance().set(&Symbol::new(e, SUBSCRIBER), &subscriber);
        e.storage().instance().set(&Symbol::new(e, MERCHANT), &merchant);
        e.storage().instance().set(&Symbol::new(e, ASSET), &asset);
        e.storage().instance().set(&Symbol::new(e, AMOUNT), &amount);
        e.storage().instance().set(&Symbol::new(e, INTERVAL), &interval);
        e.storage().instance().set(&Symbol::new(e, NEXT_CHARGE), &next_charge);
        e.storage().instance().set(&Symbol::new(e, ACTIVE), &true);
    }

    fn subscriber(e: &Env) -> Address {
        e.storage().instance().get(&Symbol::new(e, SUBSCRIBER)).unwrap()
    }

    fn merchant(e: &Env) -> Address {
        e.storage().instance().get(&Symbol::new(e, MERCHANT)).unwrap()
    }

    fn asset(e: &Env) -> Address {
        e.storage().instance().get(&Symbol::new(e, ASSET)).unwrap()
    }

    fn amount(e: &Env) -> i128 {
        e.storage().instance().get(&Symbol::new(e, AMOUNT)).unwrap()
    }

    fn interval(e: &Env) -> u32 {
        e.storage().instance().get(&Symbol::new(e, INTERVAL)).unwrap()
    }

    fn next_charge(e: &Env) -> Timepoint {
        e.storage().instance().get(&Symbol::new(e, NEXT_CHARGE)).unwrap()
    }

    fn set_next_charge(e: &Env, value: Timepoint) {
        e.storage().instance().set(&Symbol::new(e, NEXT_CHARGE), &value);
    }

    fn active(e: &Env) -> bool {
        e.storage().instance().get(&Symbol::new(e, ACTIVE)).unwrap_or(false)
    }

    fn set_active(e: &Env, value: bool) {
        e.storage().instance().set(&Symbol::new(e, ACTIVE), &value);
    }

    /// Transfers `amount` of `asset` from the subscriber to the merchant if the
    /// subscription is active and the ledger time has reached `next_charge`.
    /// Advances the schedule by `interval` and returns whether a charge
    /// occurred. Fails cleanly (returns `false`) when inactive or before the
    /// next charge time. Authorization: the subscriber (`first-address`).
    pub fn charge(e: &Env, subscriber: Address) -> bool {
        subscriber.require_auth();
        if !Self::active(e) {
            return false;
        }
        if subscriber != Self::subscriber(e) {
            panic!("only the subscriber may charge this subscription");
        }
        if e.ledger().timestamp() < Self::next_charge(e).to_unix() {
            return false;
        }
        let token = TokenClient::new(e, &Self::asset(e));
        token.transfer(&subscriber, &Self::merchant(e), &Self::amount(e));
        let interval = Self::interval(e);
        let advanced = Self::next_charge(e).to_unix() + interval as u64;
        Self::set_next_charge(e, Timepoint::from_unix(e, advanced));
        true
    }

    /// Cancels the subscription. Only the subscriber may cancel. Returns whether
    /// cancellation occurred (false if already inactive). Authorization: the
    /// subscriber (`first-address`).
    pub fn cancel(e: &Env, subscriber: Address) -> bool {
        subscriber.require_auth();
        if !Self::active(e) {
            return false;
        }
        if subscriber != Self::subscriber(e) {
            panic!("only the subscriber may cancel this subscription");
        }
        Self::set_active(e, false);
        true
    }

    /// Returns whether the subscription is still active.
    pub fn is_active(e: &Env) -> bool {
        Self::active(e)
    }
}

#[cfg(test)]
mod test;
