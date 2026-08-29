#![cfg(test)]
extern crate std;

use crate::{AllowanceManager, AllowanceManagerClient};
use soroban_sdk::{
    testutils::Address as _,
    Address, Env, String,
};
use token::{Token, TokenClient};

fn create_token<'a>(e: &Env, admin: &Address) -> (Address, TokenClient<'a>) {
    let address = e.register(
        Token,
        (
            admin.clone(),
            7u32,
            String::from_str(e, "Delegated Asset"),
            String::from_str(e, "DEL"),
        ),
    );
    (address.clone(), TokenClient::new(e, &address))
}

fn create_allowance(e: &Env) -> AllowanceManagerClient<'static> {
    let address = e.register(AllowanceManager, ());
    AllowanceManagerClient::new(e, &address)
}

#[test]
fn approve_records_allowance() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let spender = Address::generate(&e);
    let (asset, _tc) = create_token(&e, &owner);

    let am = create_allowance(&e);
    am.approve(&owner, &asset, &spender, &500);

    assert_eq!(am.allowance(&owner, &asset, &spender), 500);
}

#[test]
fn transfer_from_spends_within_allowance() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let spender = Address::generate(&e);
    let recipient = Address::generate(&e);
    let (asset, tc) = create_token(&e, &owner);
    tc.mint(&owner, &1000);

    // `approve` both records the policy limit and approves the manager on the
    // token, so the manager can pull on the owner's behalf.
    let am_address = e.register(AllowanceManager, ());
    let am = AllowanceManagerClient::new(&e, &am_address);
    am.approve(&owner, &asset, &spender, &400);
    am.transfer_from(&spender, &asset, &owner, &recipient, &250);

    assert_eq!(am.allowance(&owner, &asset, &spender), 150);
    assert_eq!(tc.balance(&owner), 750);
    assert_eq!(tc.balance(&recipient), 250);
}

#[test]
#[should_panic(expected = "allowance exceeded")]
fn transfer_from_over_allowance_panics() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let spender = Address::generate(&e);
    let recipient = Address::generate(&e);
    let (asset, tc) = create_token(&e, &owner);
    tc.mint(&owner, &1000);

    let am = create_allowance(&e);
    am.approve(&owner, &asset, &spender, &100);
    am.transfer_from(&spender, &asset, &owner, &recipient, &200);
}

#[test]
fn increase_and_decrease_adjust_allowance() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let spender = Address::generate(&e);
    let (asset, _tc) = create_token(&e, &owner);

    let am = create_allowance(&e);
    am.approve(&owner, &asset, &spender, &100);
    am.increase_allowance(&owner, &asset, &spender, &50);
    assert_eq!(am.allowance(&owner, &asset, &spender), 150);
    am.decrease_allowance(&owner, &asset, &spender, &30);
    assert_eq!(am.allowance(&owner, &asset, &spender), 120);
}

#[test]
#[should_panic(expected = "allowance would underflow")]
fn decrease_below_zero_panics() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let spender = Address::generate(&e);
    let (asset, _tc) = create_token(&e, &owner);

    let am = create_allowance(&e);
    am.approve(&owner, &asset, &spender, &10);
    am.decrease_allowance(&owner, &asset, &spender, &30);
}
