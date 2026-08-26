#![cfg(test)]
extern crate std;

use crate::{Subscription, SubscriptionClient};
use soroban_sdk::{
    testutils::Address as _,
    testutils::Ledger as _,
    Address, Env, String,
};
use test_asset::{TestAsset, TestAssetClient};

fn register_asset<'a>(e: &Env, admin: &Address) -> (Address, TestAssetClient<'a>) {
    let address = e.register(
        TestAsset,
        (
            admin.clone(),
            7u32,
            String::from_str(e, "Sub Asset"),
            String::from_str(e, "SUB"),
        ),
    );
    (address.clone(), TestAssetClient::new(e, &address))
}

fn deploy(
    e: &Env,
    subscriber: &Address,
    merchant: &Address,
    asset: &Address,
    amount: i128,
    interval: u32,
) -> SubscriptionClient<'static> {
    let address = e.register(
        Subscription,
        (
            subscriber.clone(),
            merchant.clone(),
            asset.clone(),
            amount,
            interval,
        ),
    );
    SubscriptionClient::new(e, &address)
}

#[test]
fn starts_active() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let subscriber = Address::generate(&e);
    let merchant = Address::generate(&e);
    let (asset, asset_client) = register_asset(&e, &admin);
    asset_client.mint(&subscriber, &10000);
    let client = deploy(&e, &subscriber, &merchant, &asset, 1000, 3600);
    assert!(client.is_active());
}

#[test]
fn charge_fails_before_interval() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let subscriber = Address::generate(&e);
    let merchant = Address::generate(&e);
    let (asset, asset_client) = register_asset(&e, &admin);
    asset_client.mint(&subscriber, &10000);
    let client = deploy(&e, &subscriber, &merchant, &asset, 1000, 3600);
    // Ledger timestamp defaults to 0; next_charge = 3600, so charge is gated.
    assert_eq!(client.charge(&subscriber), false);
}

#[test]
fn charge_succeeds_after_interval_and_advances() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let subscriber = Address::generate(&e);
    let merchant = Address::generate(&e);
    let (asset, asset_client) = register_asset(&e, &admin);
    let amount: i128 = 1000;
    asset_client.mint(&subscriber, &10000);
    let client = deploy(&e, &subscriber, &merchant, &asset, amount, 3600);

    // Advance ledger time to exactly next_charge (0 + 3600).
    e.ledger().set_timestamp(3600u64);
    let before_sub = asset_client.balance(&subscriber);
    let before_mer = asset_client.balance(&merchant);
    assert_eq!(client.charge(&subscriber), true);
    assert_eq!(asset_client.balance(&subscriber), before_sub - amount);
    assert_eq!(asset_client.balance(&merchant), before_mer + amount);

    // Schedule advanced to 7200; immediate second charge is still gated.
    assert_eq!(client.charge(&subscriber), false);

    // Advance to 7200 and charge again.
    e.ledger().set_timestamp(7200u64);
    assert_eq!(client.charge(&subscriber), true);
}

#[test]
fn cancel_stops_charges() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let subscriber = Address::generate(&e);
    let merchant = Address::generate(&e);
    let (asset, asset_client) = register_asset(&e, &admin);
    asset_client.mint(&subscriber, &10000);
    let client = deploy(&e, &subscriber, &merchant, &asset, 1000, 3600);

    e.ledger().set_timestamp(3600u64);
    assert_eq!(client.charge(&subscriber), true);
    assert_eq!(client.cancel(&subscriber), true);
    assert!(!client.is_active());

    // Further charges fail once cancelled.
    assert_eq!(client.charge(&subscriber), false);
    // Cancelling again is a no-op (already inactive).
    assert_eq!(client.cancel(&subscriber), false);
}

#[test]
fn only_subscriber_may_charge_or_cancel() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let subscriber = Address::generate(&e);
    let merchant = Address::generate(&e);
    let intruder = Address::generate(&e);
    let (asset, asset_client) = register_asset(&e, &admin);
    asset_client.mint(&subscriber, &10000);
    let client = deploy(&e, &subscriber, &merchant, &asset, 1000, 3600);

    // Auth is mocked, but the stored-subscriber check still rejects intruders.
    let charge_result = client.try_charge(&intruder);
    assert!(charge_result.is_err());
    let cancel_result = client.try_cancel(&intruder);
    assert!(cancel_result.is_err());
}
