#![cfg(test)]
extern crate std;

use crate::{AtomicSwap, AtomicSwapClient};
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
            String::from_str(e, "Swap Asset"),
            String::from_str(e, "SWP"),
        ),
    );
    (address.clone(), TokenClient::new(e, &address))
}

fn create_swap(e: &Env) -> AtomicSwapClient<'static> {
    let address = e.register(AtomicSwap, ());
    AtomicSwapClient::new(e, &address)
}

#[test]
fn successful_swap_moves_both_assets() {
    let e = Env::default();
    e.mock_all_auths();
    let offerer = Address::generate(&e);
    let taker = Address::generate(&e);

    let (offer_asset, offer_tc) = create_token(&e, &offerer);
    let (ask_asset, ask_tc) = create_token(&e, &offerer);
    offer_tc.mint(&offerer, &1_000_000);
    ask_tc.mint(&taker, &1_000_000);

    let swap = create_swap(&e);
    let id = swap.create_offer(&offerer, &offer_asset, &100, &ask_asset, &200);
    assert_eq!(swap.offer_active(&id), true);

    swap.execute(&taker, &id);

    // Atomic transition: both legs happened and the offer is now inactive.
    assert_eq!(swap.offer_active(&id), false);
    assert_eq!(offer_tc.balance(&offerer), 999_900);
    assert_eq!(offer_tc.balance(&taker), 100);
    assert_eq!(ask_tc.balance(&offerer), 200);
    assert_eq!(ask_tc.balance(&taker), 999_800);
}

#[test]
#[should_panic(expected = "amounts must be positive")]
fn rejects_zero_or_negative_amount() {
    let e = Env::default();
    e.mock_all_auths();
    let offerer = Address::generate(&e);
    let (offer_asset, _o) = create_token(&e, &offerer);
    let (ask_asset, _a) = create_token(&e, &offerer);

    let swap = create_swap(&e);
    swap.create_offer(&offerer, &offer_asset, &0, &ask_asset, &200);
}

#[test]
#[should_panic(expected = "offer and ask assets must differ")]
fn rejects_same_asset_offer() {
    let e = Env::default();
    e.mock_all_auths();
    let offerer = Address::generate(&e);
    let (asset, _t) = create_token(&e, &offerer);

    let swap = create_swap(&e);
    swap.create_offer(&offerer, &asset, &100, &asset, &200);
}

#[test]
#[should_panic(expected = "only the offerer can cancel")]
fn only_offerer_can_cancel() {
    let e = Env::default();
    e.mock_all_auths();
    let offerer = Address::generate(&e);
    let taker = Address::generate(&e);
    let (offer_asset, _o) = create_token(&e, &offerer);
    let (ask_asset, _a) = create_token(&e, &offerer);

    let swap = create_swap(&e);
    let id = swap.create_offer(&offerer, &offer_asset, &100, &ask_asset, &200);
    // A non-offerer tries to cancel — must be rejected.
    swap.cancel_offer(&taker, &id);
}

#[test]
#[should_panic(expected = "offer is not active")]
fn execute_after_cancel_panics() {
    let e = Env::default();
    e.mock_all_auths();
    let offerer = Address::generate(&e);
    let taker = Address::generate(&e);
    let (offer_asset, _o) = create_token(&e, &offerer);
    let (ask_asset, _a) = create_token(&e, &offerer);
    offer_tc_mint_helper(&e, &offerer, &offer_asset);
    ask_tc_mint_helper(&e, &taker, &ask_asset);

    let swap = create_swap(&e);
    let id = swap.create_offer(&offerer, &offer_asset, &100, &ask_asset, &200);
    swap.cancel_offer(&offerer, &id);
    swap.execute(&taker, &id);
}

#[test]
#[should_panic(expected = "no such offer")]
fn execute_missing_offer_panics() {
    let e = Env::default();
    e.mock_all_auths();
    let taker = Address::generate(&e);

    let swap = create_swap(&e);
    swap.execute(&taker, &999);
}

#[test]
#[should_panic(expected = "insufficient balance")]
fn execute_fails_when_entrant_lacks_ask_balance() {
    let e = Env::default();
    e.mock_all_auths();
    let offerer = Address::generate(&e);
    let taker = Address::generate(&e);
    let (offer_asset, _o) = create_token(&e, &offerer);
    let (ask_asset, _a) = create_token(&e, &offerer);
    // Offerer has the offer asset; taker has NO ask asset.
    offer_tc_mint_helper(&e, &offerer, &offer_asset);

    let swap = create_swap(&e);
    let id = swap.create_offer(&offerer, &offer_asset, &100, &ask_asset, &200);
    swap.execute(&taker, &id);
}

// Small helpers so the insufficient-balance test reads clearly without
// threading the token clients through.
fn offer_tc_mint_helper(e: &Env, to: &Address, asset: &Address) {
    TokenClient::new(e, asset).mint(to, &1_000_000);
}

fn ask_tc_mint_helper(e: &Env, to: &Address, asset: &Address) {
    TokenClient::new(e, asset).mint(to, &1_000_000);
}
