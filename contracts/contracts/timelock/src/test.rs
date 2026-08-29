#![cfg(test)]
extern crate std;

use crate::{Timelock, TimelockClient};
use soroban_sdk::{
    testutils::Address as _,
    testutils::Ledger as _,
    Address, Env, String,
};
use token::{Token, TokenClient};

fn create_token<'a>(e: &Env, admin: &Address) -> (Address, TokenClient<'a>) {
    let address = e.register(
        Token,
        (
            admin.clone(),
            7u32,
            String::from_str(e, "Timelock Asset"),
            String::from_str(e, "TLA"),
        ),
    );
    (address.clone(), TokenClient::new(e, &address))
}

fn create_timelock(e: &Env) -> TimelockClient<'static> {
    let address = e.register(Timelock, ());
    TimelockClient::new(e, &address)
}

#[test]
fn successful_release_after_unlock() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let beneficiary = Address::generate(&e);

    let (asset, tc) = create_token(&e, &owner);
    tc.mint(&owner, &1_000);

    let timelock = create_timelock(&e);
    let contract = timelock.address.clone();
    let id = timelock.lock(&owner, &asset, &1_000, &beneficiary, &1000);

    // Asset is escrowed in the contract immediately.
    assert_eq!(tc.balance(&owner), 0);
    assert_eq!(tc.balance(&contract), 1_000);

    // Advance ledger time past the unlock point (legitimate test mechanism).
    e.ledger().set_timestamp(1000);

    assert_eq!(timelock.is_unlocked(&id), true);
    timelock.release(&id);

    // Beneficiary received the full amount and the lock is spent.
    assert_eq!(tc.balance(&beneficiary), 1_000);
    assert_eq!(tc.balance(&contract), 0);
    assert_eq!(timelock.lock_released(&id), true);
}

#[test]
#[should_panic(expected = "timelock not yet unlocked")]
fn release_before_unlock_panics() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let beneficiary = Address::generate(&e);

    let (asset, tc) = create_token(&e, &owner);
    tc.mint(&owner, &1_000);
    let timelock = create_timelock(&e);

    let id = timelock.lock(&owner, &asset, &1_000, &beneficiary, &1000);
    // Ledger timestamp is still 0 (< 1000): release must refuse.
    assert_eq!(timelock.is_unlocked(&id), false);
    timelock.release(&id);
}

#[test]
#[should_panic(expected = "lock already released")]
fn release_already_released_panics() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let beneficiary = Address::generate(&e);

    let (asset, tc) = create_token(&e, &owner);
    tc.mint(&owner, &1_000);
    let timelock = create_timelock(&e);

    let id = timelock.lock(&owner, &asset, &1_000, &beneficiary, &1);
    e.ledger().set_timestamp(1);
    timelock.release(&id);
    // Second release must refuse.
    timelock.release(&id);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn rejects_zero_amount() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let beneficiary = Address::generate(&e);

    let (asset, _tc) = create_token(&e, &owner);
    let timelock = create_timelock(&e);
    timelock.lock(&owner, &asset, &0, &beneficiary, &1000);
}

#[test]
fn unlock_time_and_state_queries() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let beneficiary = Address::generate(&e);

    let (asset, tc) = create_token(&e, &owner);
    tc.mint(&owner, &1_000);
    let timelock = create_timelock(&e);
    let id = timelock.lock(&owner, &asset, &500, &beneficiary, &1000);

    assert_eq!(timelock.unlock_time(&id), 1000);
    assert_eq!(timelock.is_unlocked(&id), false);
    assert_eq!(timelock.lock_released(&id), false);

    e.ledger().set_timestamp(1000);
    assert_eq!(timelock.is_unlocked(&id), true);
}
