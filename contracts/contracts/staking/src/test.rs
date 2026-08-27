#![cfg(test)]
extern crate std;

use crate::{Staking, StakingClient};
use soroban_sdk::{
    testutils::Address as _,
    testutils::Ledger as _,
    Address, Env, String,
};
use test_asset::{TestAsset, TestAssetClient};

fn register_asset<'a>(e: &Env, admin: &Address) -> (Address, TestAssetClient<'a>) {
    let address = e.register(
        TestAsset,
        (admin.clone(), 7u32, String::from_str(e, "Stake Asset"), String::from_str(e, "STK")),
    );
    (address.clone(), TestAssetClient::new(e, &address))
}

fn deploy(e: &Env, asset: &Address, duration: u32) -> StakingClient<'static> {
    let address = e.register(Staking, (asset.clone(), duration));
    StakingClient::new(e, &address)
}

#[test]
#[should_panic]
fn rejects_zero_duration() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let (asset, _) = register_asset(&e, &admin);
    e.register(Staking, (asset.clone(), 0u32));
}

#[test]
fn stake_increases_balance_and_pool_total() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let user = Address::generate(&e);
    let (asset, asset_client) = register_asset(&e, &admin);
    let client = deploy(&e, &asset, 1000);

    asset_client.mint(&admin, &1_000_000);
    client.fund_rewards(&admin, &1_000_000);
    asset_client.mint(&user, &500_000);
    client.stake(&user, &100_000);

    assert_eq!(client.staked_balance(&user), 100_000);
    assert_eq!(client.total_staked(), 100_000);
    // No time has passed, so no rewards have accrued yet.
    assert_eq!(client.earned(&user), 0);
    // Staked tokens left the user's wallet.
    assert_eq!(asset_client.balance(&user), 400_000);
}

#[test]
fn fund_then_stake_accrues_linearly_over_time() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let user = Address::generate(&e);
    let (asset, asset_client) = register_asset(&e, &admin);
    let client = deploy(&e, &asset, 1000);

    asset_client.mint(&admin, &1_000_000);
    // rate = 1_000_000 / 1000 = 1000 reward units per second.
    client.fund_rewards(&admin, &1_000_000);
    asset_client.mint(&user, &1_000_000);
    client.stake(&user, &100_000);

    // t = 500: 100_000 staked * (500 * 1000 / 100_000) = 500_000.
    e.ledger().set_timestamp(500u64);
    assert_eq!(client.earned(&user), 500_000);

    // t = 1000 (period end): 100_000 * (1000 * 1000 / 100_000) = 1_000_000.
    e.ledger().set_timestamp(1000u64);
    assert_eq!(client.earned(&user), 1_000_000);

    // Past the period finish: accrual is capped, rewards do not grow.
    e.ledger().set_timestamp(5000u64);
    assert_eq!(client.earned(&user), 1_000_000);
}

#[test]
fn claim_transfers_accrued_rewards() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let user = Address::generate(&e);
    let (asset, asset_client) = register_asset(&e, &admin);
    let client = deploy(&e, &asset, 1000);

    asset_client.mint(&admin, &1_000_000);
    client.fund_rewards(&admin, &1_000_000);
    asset_client.mint(&user, &1_000_000);
    client.stake(&user, &100_000);

    e.ledger().set_timestamp(500u64);
    assert_eq!(client.claim(&user), 500_000);
    // User kept 900_000 from minting (1_000_000 - 100_000 staked) plus 500_000 claimed.
    assert_eq!(asset_client.balance(&user), 1_400_000);
    // Rewards are cleared after a claim.
    assert_eq!(client.earned(&user), 0);
}

#[test]
fn unstake_returns_stake_and_claims_rewards() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let user = Address::generate(&e);
    let (asset, asset_client) = register_asset(&e, &admin);
    let client = deploy(&e, &asset, 1000);

    asset_client.mint(&admin, &1_000_000);
    client.fund_rewards(&admin, &1_000_000);
    asset_client.mint(&user, &1_000_000);
    client.stake(&user, &100_000);

    e.ledger().set_timestamp(500u64);
    // Unstake the full balance; claims 500_000 rewards and returns 100_000 stake.
    client.unstake(&user, &100_000);
    assert_eq!(client.staked_balance(&user), 0);
    assert_eq!(client.total_staked(), 0);
    assert_eq!(client.earned(&user), 0);
    // User kept 900_000 from minting plus 500_000 reward plus 100_000 stake back.
    assert_eq!(asset_client.balance(&user), 1_500_000);
}

#[test]
fn partial_unstake_keeps_remaining_stake_accruing() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let user = Address::generate(&e);
    let (asset, asset_client) = register_asset(&e, &admin);
    let client = deploy(&e, &asset, 1000);

    asset_client.mint(&admin, &1_000_000);
    client.fund_rewards(&admin, &1_000_000);
    asset_client.mint(&user, &1_000_000);
    client.stake(&user, &100_000);

    e.ledger().set_timestamp(500u64);
    client.unstake(&user, &40_000);
    assert_eq!(client.staked_balance(&user), 60_000);
    assert_eq!(client.earned(&user), 0);
    // User kept 900_000 from minting plus 500_000 reward plus 40_000 stake back.
    assert_eq!(asset_client.balance(&user), 1_440_000);

    // Remaining 60_000 keeps accruing from t=500 onward. At t=750 the global rate
    // has advanced 250 seconds at 1000/sec over 60_000 staked:
    //   floor(250_000 * PRECISION / 60_000) / PRECISION * 60_000 = 249_999
    // (integer truncation in the per-token rate). This confirms the remaining
    // stake continues to earn while the withdrawn portion does not.
    e.ledger().set_timestamp(750u64);
    assert_eq!(client.earned(&user), 249_999);
}

#[test]
#[should_panic]
fn stake_rejects_non_positive_amount() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let user = Address::generate(&e);
    let (asset, _) = register_asset(&e, &admin);
    let client = deploy(&e, &asset, 1000);
    client.stake(&user, &0);
}

#[test]
fn unstake_without_stake_is_a_safe_noop() {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let user = Address::generate(&e);
    let (asset, asset_client) = register_asset(&e, &admin);
    let client = deploy(&e, &asset, 1000);

    asset_client.mint(&admin, &1_000_000);
    client.fund_rewards(&admin, &1_000_000);
    let contract = client.address.clone();
    let pool_before = asset_client.balance(&contract);

    // A user who never staked calls unstake; with nothing staked `out` is zero,
    // so no token transfer should occur and the reward pool must be untouched.
    client.unstake(&user, &100_000);

    assert_eq!(client.total_staked(), 0);
    assert_eq!(client.staked_balance(&user), 0);
    assert_eq!(client.earned(&user), 0);
    assert_eq!(asset_client.balance(&contract), pool_before);
}
