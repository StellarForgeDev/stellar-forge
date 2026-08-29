#![cfg(test)]
extern crate std;

use core::option::Option as SOption;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::{StellarAssetClient, TokenClient},
    Address, Duration, Env, Timepoint,
};
use crate::{ClaimableBalance, ClaimableBalanceClient};

fn create_token<'a>(e: &Env, admin: &Address) -> (TokenClient<'a>, StellarAssetClient<'a>) {
    let addr = e.register_stellar_asset_contract(admin.clone());
    (
        TokenClient::new(e, &addr),
        StellarAssetClient::new(e, &addr),
    )
}

/// Runs `f` with a freshly deployed Claimable Balance contract plus a funded
/// token. Authorization is mocked by default; individual tests disable it to
/// exercise refusal paths.
fn with_setup<F, R>(f: F) -> R
where
    F: FnOnce(
        &Env,
        &Address,
        &Address,
        &Address,
        &Address,
        &TokenClient,
        &ClaimableBalanceClient,
    ) -> R,
{
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let funder = Address::generate(&e);
    let claimant = Address::generate(&e);
    let other = Address::generate(&e);
    let (token, token_admin) = create_token(&e, &admin);
    token_admin.mint(&admin, &100_000_000_000_000_000_000_000);
    token_admin.mint(&funder, &100_000_000_000_000_000_000_000);
    let contract_id = e.register(ClaimableBalance, (admin.clone(), token.address.clone()));
    let client = ClaimableBalanceClient::new(&e, &contract_id);
    f(&e, &admin, &funder, &claimant, &other, &token, &client)
}

#[test]
fn deposit_escrows_and_reports_state() {
    with_setup(|e, _a, funder, claimant, _o, token, client| {
        e.mock_all_auths();
        let amount = 1_000i128;
        let before = token.balance(&client.address);
        let id = client.deposit(
            funder,
            claimant,
            &amount,
            &Duration::from_seconds(&e, 10),
            &SOption::None,
        );
        assert_eq!(id, 0u64);
        let after = token.balance(&client.address);
        assert_eq!(after - before, amount);
        assert_eq!(client.balance_of(&id), amount);
        assert_eq!(client.is_claimable(&id), false);
    });
}

#[test]
fn claim_fails_before_unlock() {
    with_setup(|e, _a, funder, claimant, _o, _t, client| {
        e.mock_all_auths();
        let id = client.deposit(
            funder,
            claimant,
            &1_000,
            &Duration::from_seconds(&e, 100),
            &SOption::None,
        );
        assert!(client.try_claim(&id).is_err());
    });
}

#[test]
fn claim_succeeds_after_unlock() {
    with_setup(|e, _a, funder, claimant, _o, _t, client| {
        e.mock_all_auths();
        let id = client.deposit(
            funder,
            claimant,
            &1_000,
            &Duration::from_seconds(&e, 100),
            &SOption::None,
        );
        e.ledger().set_timestamp(500);
        client.claim(&id);
        assert_eq!(client.is_claimable(&id), false);
        assert_eq!(client.balance_of(&id), 0);
    });
}

#[test]
fn double_claim_fails() {
    with_setup(|e, _a, funder, claimant, _o, _t, client| {
        e.mock_all_auths();
        let id = client.deposit(
            funder,
            claimant,
            &1_000,
            &Duration::from_seconds(&e, 0),
            &SOption::None,
        );
        client.claim(&id);
        assert!(client.try_claim(&id).is_err());
    });
}

#[test]
fn claimant_must_authorize_claim() {
    with_setup(|e, _a, funder, claimant, _o, _t, client| {
        e.mock_all_auths();
        let id = client.deposit(
            funder,
            claimant,
            &1_000,
            &Duration::from_seconds(&e, 0),
            &SOption::None,
        );
        e.set_auths(&[]);
        assert!(client.try_claim(&id).is_err());
    });
}

#[test]
fn expiry_none_claimable_after_delay() {
    with_setup(|e, _a, funder, claimant, _o, _t, client| {
        e.mock_all_auths();
        let id = client.deposit(
            funder,
            claimant,
            &1_000,
            &Duration::from_seconds(&e, 10),
            &SOption::None,
        );
        e.ledger().set_timestamp(5);
        assert_eq!(client.is_claimable(&id), false);
        e.ledger().set_timestamp(10);
        assert_eq!(client.is_claimable(&id), true);
        client.claim(&id);
    });
}

#[test]
fn expiry_some_blocks_past_expiry() {
    with_setup(|e, _a, funder, claimant, _o, _t, client| {
        e.mock_all_auths();
        let exp = 20u64;
        let id = client.deposit(
            funder,
            claimant,
            &1_000,
            &Duration::from_seconds(&e, 10),
            &SOption::Some(Timepoint::from_unix(&e, exp)),
        );
        e.ledger().set_timestamp(15);
        assert_eq!(client.is_claimable(&id), true);
        client.claim(&id);

        let id2 = client.deposit(
            funder,
            claimant,
            &1_000,
            &Duration::from_seconds(&e, 10),
            &SOption::Some(Timepoint::from_unix(&e, exp)),
        );
        e.ledger().set_timestamp(25);
        assert_eq!(client.is_claimable(&id2), false);
        assert!(client.try_claim(&id2).is_err());
    });
}

#[test]
fn admin_cancel_refunds_funder() {
    with_setup(|e, _admin, funder, claimant, _o, token, client| {
        e.mock_all_auths();
        let amount = 1_000i128;
        let before = token.balance(funder);
        let id = client.deposit(
            funder,
            claimant,
            &amount,
            &Duration::from_seconds(&e, 100),
            &SOption::None,
        );
        client.cancel(&id);
        let after = token.balance(funder);
        // Cancel refunds the full escrowed amount back to the funder, so the
        // funder's balance returns to what it was before the deposit.
        assert_eq!(after - before, 0);
        assert_eq!(client.is_claimable(&id), false);
        assert!(client.try_claim(&id).is_err());
    });
}

#[test]
fn cancel_requires_admin() {
    with_setup(|e, _a, funder, claimant, _o, _t, client| {
        e.mock_all_auths();
        let id = client.deposit(
            funder,
            claimant,
            &1_000,
            &Duration::from_seconds(&e, 100),
            &SOption::None,
        );
        e.set_auths(&[]);
        assert!(client.try_cancel(&id).is_err());
    });
}

#[test]
fn cancel_after_claim_fails() {
    with_setup(|e, _a, funder, claimant, _o, _t, client| {
        e.mock_all_auths();
        let id = client.deposit(
            funder,
            claimant,
            &1_000,
            &Duration::from_seconds(&e, 0),
            &SOption::None,
        );
        client.claim(&id);
        assert!(client.try_cancel(&id).is_err());
    });
}

#[test]
fn zero_amount_rejected() {
    with_setup(|e, _a, funder, claimant, _o, _t, client| {
        e.mock_all_auths();
        assert!(client
            .try_deposit(
                funder,
                claimant,
                &0,
                &Duration::from_seconds(&e, 10),
                &SOption::None,
            )
            .is_err());
    });
}

#[test]
fn insufficient_funds_rejected() {
    with_setup(|e, _a, funder, claimant, _o, _t, client| {
        e.mock_all_auths();
        assert!(client
            .try_deposit(
                funder,
                claimant,
                &1_000_000_000_000_000_000_000_000,
                &Duration::from_seconds(&e, 10),
                &SOption::None,
            )
            .is_err());
    });
}

#[test]
fn expiry_roundtrip_serialization() {
    with_setup(|e, _a, funder, claimant, _o, _t, client| {
        e.mock_all_auths();
        let none_id = client.deposit(
            funder,
            claimant,
            &1_000,
            &Duration::from_seconds(&e, 10),
            &SOption::None,
        );
        assert!(client.expiry(&none_id).is_none());

        let exp = 42u64;
        let some_id = client.deposit(
            funder,
            claimant,
            &1_000,
            &Duration::from_seconds(&e, 10),
            &SOption::Some(Timepoint::from_unix(&e, exp)),
        );
        let got = client.expiry(&some_id);
        assert!(got.is_some());
        assert_eq!(got.unwrap().to_unix(), exp);
    });
}

#[test]
fn funder_must_authorize_deposit() {
    with_setup(|e, _a, funder, claimant, _o, _t, client| {
        e.mock_all_auths();
        let _id = client.deposit(
            funder,
            claimant,
            &1_000,
            &Duration::from_seconds(&e, 10),
            &SOption::None,
        );
        e.set_auths(&[]);
        assert!(client
            .try_deposit(
                funder,
                claimant,
                &1_000,
                &Duration::from_seconds(&e, 10),
                &SOption::None,
            )
            .is_err());
    });
}

#[test]
fn sequential_balance_ids() {
    with_setup(|e, _a, funder, claimant, _o, _t, client| {
        e.mock_all_auths();
        let id0 = client.deposit(
            funder,
            claimant,
            &1_000,
            &Duration::from_seconds(&e, 10),
            &SOption::None,
        );
        let id1 = client.deposit(
            funder,
            claimant,
            &1_000,
            &Duration::from_seconds(&e, 10),
            &SOption::None,
        );
        assert_eq!(id0, 0u64);
        assert_eq!(id1, 1u64);
    });
}
