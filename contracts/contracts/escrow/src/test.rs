#![cfg(test)]
extern crate std;

use crate::{Escrow, EscrowClient};
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
            String::from_str(e, "Escrow Asset"),
            String::from_str(e, "EAC"),
        ),
    );
    (address.clone(), TestAssetClient::new(e, &address))
}

/// Deploys the escrow with the given roles and asset, returning the deployed
/// contract address (needed to inspect held balances) and its client.
fn create_escrow(
    e: &Env,
    depositor: &Address,
    beneficiary: &Address,
    arbiter: &Address,
    asset: &Address,
) -> (Address, EscrowClient<'static>) {
    let address = e.register(
        Escrow,
        (
            depositor.clone(),
            beneficiary.clone(),
            arbiter.clone(),
            asset.clone(),
        ),
    );
    (address.clone(), EscrowClient::new(e, &address))
}

#[test]
#[should_panic(expected = "deposit amount must be positive")]
fn rejects_non_positive_deposit() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let depositor = Address::generate(&e);
    let beneficiary = Address::generate(&e);
    let arbiter = Address::generate(&e);
    let (asset, _) = create_asset(&e, &admin);
    let (_escrow_address, escrow) =
        create_escrow(&e, &depositor, &beneficiary, &arbiter, &asset);
    escrow.deposit(&depositor, &-1);
}

#[test]
fn deposit_moves_funds_into_escrow() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let depositor = Address::generate(&e);
    let beneficiary = Address::generate(&e);
    let arbiter = Address::generate(&e);
    let (asset, asset_client) = create_asset(&e, &admin);
    asset_client.mint(&depositor, &1000);
    let (escrow_address, escrow) =
        create_escrow(&e, &depositor, &beneficiary, &arbiter, &asset);

    escrow.deposit(&depositor, &400);

    assert_eq!(asset_client.balance(&depositor), 600);
    assert_eq!(asset_client.balance(&escrow_address), 400);
    assert_eq!(escrow.status(), 0);
}

#[test]
fn release_transfers_to_beneficiary() {
    let e = Env::default();
    e.mock_all_auths();
    let depositor = Address::generate(&e);
    let beneficiary = Address::generate(&e);
    let arbiter = Address::generate(&e);
    let admin = Address::generate(&e);
    let (asset, asset_client) = create_asset(&e, &admin);
    asset_client.mint(&depositor, &1000);
    let (escrow_address, escrow) =
        create_escrow(&e, &depositor, &beneficiary, &arbiter, &asset);

    escrow.deposit(&depositor, &400);
    escrow.release(&arbiter);

    assert_eq!(asset_client.balance(&beneficiary), 400);
    assert_eq!(asset_client.balance(&escrow_address), 0);
    assert_eq!(asset_client.balance(&depositor), 600);
    assert_eq!(escrow.status(), 1);
}

#[test]
fn refund_transfers_to_depositor() {
    let e = Env::default();
    e.mock_all_auths();
    let depositor = Address::generate(&e);
    let beneficiary = Address::generate(&e);
    let arbiter = Address::generate(&e);
    let admin = Address::generate(&e);
    let (asset, asset_client) = create_asset(&e, &admin);
    asset_client.mint(&depositor, &1000);
    let (escrow_address, escrow) =
        create_escrow(&e, &depositor, &beneficiary, &arbiter, &asset);

    escrow.deposit(&depositor, &400);
    escrow.refund(&arbiter);

    assert_eq!(asset_client.balance(&depositor), 1000);
    assert_eq!(asset_client.balance(&escrow_address), 0);
    assert_eq!(escrow.status(), 2);
}

#[test]
#[should_panic]
fn rejects_release_before_deposit() {
    let e = Env::default();
    e.mock_all_auths();
    let depositor = Address::generate(&e);
    let beneficiary = Address::generate(&e);
    let arbiter = Address::generate(&e);
    let admin = Address::generate(&e);
    let (asset, _) = create_asset(&e, &admin);
    let (_escrow_address, escrow) =
        create_escrow(&e, &depositor, &beneficiary, &arbiter, &asset);
    escrow.release(&arbiter);
}

#[test]
#[should_panic(expected = "release must be called by the arbiter")]
fn rejects_release_by_wrong_party() {
    let e = Env::default();
    e.mock_all_auths();
    let depositor = Address::generate(&e);
    let beneficiary = Address::generate(&e);
    let arbiter = Address::generate(&e);
    let admin = Address::generate(&e);
    let (asset, asset_client) = create_asset(&e, &admin);
    asset_client.mint(&depositor, &1000);
    let (_escrow_address, escrow) =
        create_escrow(&e, &depositor, &beneficiary, &arbiter, &asset);
    escrow.deposit(&depositor, &400);
    // Auth is mocked, so the requirement is satisfied, but the role check must
    // still reject a non-arbiter caller.
    let intruder = Address::generate(&e);
    escrow.release(&intruder);
}

#[test]
#[should_panic]
fn rejects_double_release() {
    let e = Env::default();
    e.mock_all_auths();
    let depositor = Address::generate(&e);
    let beneficiary = Address::generate(&e);
    let arbiter = Address::generate(&e);
    let admin = Address::generate(&e);
    let (asset, asset_client) = create_asset(&e, &admin);
    asset_client.mint(&depositor, &1000);
    let (_escrow_address, escrow) =
        create_escrow(&e, &depositor, &beneficiary, &arbiter, &asset);
    escrow.deposit(&depositor, &400);
    escrow.release(&arbiter);
    escrow.release(&arbiter);
}
