#![cfg(test)]
extern crate std;

use crate::{Payment, PaymentClient};
use soroban_sdk::{
    testutils::Address as _,
    Address, Env, String,
};
use test_asset::{TestAsset, TestAssetClient};

fn create_asset<'a>(e: &Env, admin: &Address) -> (Address, TestAssetClient<'a>) {
    let address = e.register(
        TestAsset,
        (
            admin.clone(),
            7u32,
            String::from_str(e, "Test Asset"),
            String::from_str(e, "AST"),
        ),
    );
    (address.clone(), TestAssetClient::new(e, &address))
}

fn create_payment(e: &Env) -> PaymentClient<'static> {
    let address = e.register(Payment, ());
    PaymentClient::new(e, &address)
}

#[test]
#[should_panic(expected = "negative amount is not allowed")]
fn rejects_negative_amount() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let from = Address::generate(&e);
    let to = Address::generate(&e);

    let (asset, _asset_client) = create_asset(&e, &admin);

    let payment = create_payment(&e);
    payment.pay(&from, &to, &asset, &-1);
}

#[test]
fn successful_payment_moves_balance() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let from = Address::generate(&e);
    let to = Address::generate(&e);

    let (asset, asset_client) = create_asset(&e, &admin);
    asset_client.mint(&from, &1000);

    let payment = create_payment(&e);
    payment.pay(&from, &to, &asset, &400);

    assert_eq!(asset_client.balance(&from), 600);
    assert_eq!(asset_client.balance(&to), 400);
}

#[test]
fn sender_loses_exact_amount() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let from = Address::generate(&e);
    let to = Address::generate(&e);

    let (asset, asset_client) = create_asset(&e, &admin);
    asset_client.mint(&from, &1000);

    let payment = create_payment(&e);
    payment.pay(&from, &to, &asset, &250);

    assert_eq!(asset_client.balance(&from), 750);
    assert_eq!(asset_client.balance(&to), 250);
}

#[test]
#[should_panic]
fn rejects_unauthorized_payment() {
    let e = Env::default();
    // Auth is NOT mocked: `from.require_auth()` must be satisfied.
    let admin = Address::generate(&e);
    let from = Address::generate(&e);
    let to = Address::generate(&e);

    let (asset, asset_client) = create_asset(&e, &admin);
    asset_client.mint(&from, &1000);

    let payment = create_payment(&e);
    payment.pay(&from, &to, &asset, &100);
}

#[test]
#[should_panic]
fn rejects_when_from_lacks_balance() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let from = Address::generate(&e);
    let to = Address::generate(&e);

    let (asset, _asset_client) = create_asset(&e, &admin);
    // `from` received no mint, so the transfer must fail inside the asset.

    let payment = create_payment(&e);
    payment.pay(&from, &to, &asset, &100);
}

#[test]
#[should_panic]
fn rejects_invalid_asset() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let from = Address::generate(&e);
    let to = Address::generate(&e);

    // The asset is the Payment contract itself, which is not a token.
    let payment_address = e.register(Payment, ());
    let payment = PaymentClient::new(&e, &payment_address);
    payment.pay(&from, &to, &payment_address, &100);
}

#[test]
fn payment_against_real_asset_contract() {
    // Explicitly exercises the cross-contract call into a SEP-41 asset.
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let from = Address::generate(&e);
    let to = Address::generate(&e);

    let (asset, asset_client) = create_asset(&e, &admin);
    asset_client.mint(&from, &5000);

    let payment = create_payment(&e);
    payment.pay(&from, &to, &asset, &1234);

    assert_eq!(asset_client.balance(&to), 1234);
    assert_eq!(asset_client.balance(&from), 5000 - 1234);
}
