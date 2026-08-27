#![cfg(test)]
extern crate std;

use crate::{Vesting, VestingClient};
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
            String::from_str(e, "Vest Asset"),
            String::from_str(e, "VEST"),
        ),
    );
    (address.clone(), TestAssetClient::new(e, &address))
}

fn deploy(
    e: &Env,
    beneficiary: &Address,
    asset: &Address,
    total: i128,
    start: u32,
    duration: u32,
    cliff: u32,
) -> VestingClient<'static> {
    let address = e.register(
        Vesting,
        (
            beneficiary.clone(),
            asset.clone(),
            total,
            start,
            duration,
            cliff,
        ),
    );
    VestingClient::new(e, &address)
}

#[test]
#[should_panic]
fn rejects_zero_duration() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let beneficiary = Address::generate(&e);
    let (asset, _) = register_asset(&e, &admin);
    e.register(
        Vesting,
        (
            beneficiary.clone(),
            asset.clone(),
            1000i128,
            0u32,
            0u32,
            0u32,
        ),
    );
}

#[test]
#[should_panic]
fn rejects_cliff_after_duration() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let beneficiary = Address::generate(&e);
    let (asset, _) = register_asset(&e, &admin);
    e.register(
        Vesting,
        (
            beneficiary.clone(),
            asset.clone(),
            1000i128,
            0u32,
            100u32,
            200u32,
        ),
    );
}

#[test]
fn claimable_zero_before_cliff() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let beneficiary = Address::generate(&e);
    let (asset, asset_client) = register_asset(&e, &admin);
    let total: i128 = 1_000_000;
    let client = deploy(&e, &beneficiary, &asset, total, 0, 1000, 500);
    asset_client.mint(&admin, &total);
    client.deposit(&admin, &total);

    // t=0 is before the cliff (t=500): nothing vested.
    assert_eq!(client.claimable(), 0);
    assert_eq!(client.released(), 0);
}

#[test]
fn only_beneficiary_may_claim() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let beneficiary = Address::generate(&e);
    let intruder = Address::generate(&e);
    let (asset, asset_client) = register_asset(&e, &admin);
    let total: i128 = 1_000_000;
    let client = deploy(&e, &beneficiary, &asset, total, 0, 1000, 0);
    asset_client.mint(&admin, &total);
    client.deposit(&admin, &total);

    // A non-beneficiary caller is rejected by the stored-beneficiary check,
    // independent of mocked auth.
    assert!(client.try_claim(&intruder).is_err());
}

#[test]
fn claims_linearly_after_cliff_and_fully_at_end() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let beneficiary = Address::generate(&e);
    let (asset, asset_client) = register_asset(&e, &admin);
    let total: i128 = 1_000_000;
    let client = deploy(&e, &beneficiary, &asset, total, 0, 1000, 0);
    asset_client.mint(&admin, &total);
    client.deposit(&admin, &total);

    // 25% through: claimable = 250_000.
    e.ledger().set_timestamp(250u64);
    assert_eq!(client.claimable(), 250_000);
    let before = asset_client.balance(&beneficiary);
    assert_eq!(client.claim(&beneficiary), 250_000);
    assert_eq!(asset_client.balance(&beneficiary), before + 250_000);
    assert_eq!(client.released(), 250_000);

    // Immediately after, nothing new has vested.
    assert_eq!(client.claimable(), 0);

    // 50% through: another 250_000 vested.
    e.ledger().set_timestamp(500u64);
    assert_eq!(client.claimable(), 250_000);
    assert_eq!(client.claim(&beneficiary), 250_000);
    assert_eq!(client.released(), 500_000);

    // At the end: remaining 500_000, then nothing left.
    e.ledger().set_timestamp(1000u64);
    assert_eq!(client.claimable(), 500_000);
    assert_eq!(client.claim(&beneficiary), 500_000);
    assert_eq!(client.released(), total);
    assert_eq!(client.claimable(), 0);
}

#[test]
fn claim_before_cliff_transfers_nothing() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let beneficiary = Address::generate(&e);
    let (asset, asset_client) = register_asset(&e, &admin);
    let total: i128 = 1_000_000;
    // start=100, cliff=200, so t=150 is past start but before cliff.
    let client = deploy(&e, &beneficiary, &asset, total, 100, 1000, 200);
    asset_client.mint(&admin, &total);
    client.deposit(&admin, &total);
    e.ledger().set_timestamp(150u64);

    assert_eq!(client.claimable(), 0);
    assert_eq!(client.claim(&beneficiary), 0);
    assert_eq!(client.released(), 0);
    assert_eq!(asset_client.balance(&beneficiary), 0);
}
