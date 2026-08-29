#![cfg(test)]
extern crate std;

use crate::{Crowdfund, CrowdfundClient};
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
            String::from_str(e, "Crowdfund Asset"),
            String::from_str(e, "CFA"),
        ),
    );
    (address.clone(), TokenClient::new(e, &address))
}

fn create_crowdfund(e: &Env) -> CrowdfundClient<'static> {
    let address = e.register(Crowdfund, ());
    CrowdfundClient::new(e, &address)
}

#[test]
fn successful_campaign_reaches_goal_and_owner_withdraws() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let a = Address::generate(&e);
    let b = Address::generate(&e);

    let (asset, tc) = create_token(&e, &owner);
    tc.mint(&a, &1000);
    tc.mint(&b, &1000);
    let cf = create_crowdfund(&e);
    let id = cf.create_campaign(&owner, &asset, &1000, &1000);

    cf.contribute(&id, &a, &600);
    cf.contribute(&id, &b, &400);

    // Composite result serialization exercised before the deadline.
    assert_eq!(cf.total_raised(&id), 1000);
    assert_eq!(cf.goal_reached(&id), true);
    assert_eq!(cf.contributors(&id).len(), 2);
    assert_eq!(cf.contribution_of(&id, &a), 600);
    assert_eq!(cf.contribution_of(&id, &b), 400);

    // Success path: only after the deadline may the owner withdraw.
    e.ledger().set_timestamp(1000);
    cf.withdraw(&id, &owner);

    let contract = cf.address.clone();
    assert_eq!(tc.balance(&owner), 1000);
    assert_eq!(tc.balance(&contract), 0);
    assert_eq!(cf.goal_reached(&id), true);
}

#[test]
fn failed_campaign_refunds_contributors() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let a = Address::generate(&e);
    let b = Address::generate(&e);

    let (asset, tc) = create_token(&e, &owner);
    tc.mint(&a, &1000);
    tc.mint(&b, &1000);
    let cf = create_crowdfund(&e);
    let id = cf.create_campaign(&owner, &asset, &1000, &1000);
    cf.contribute(&id, &a, &300);
    cf.contribute(&id, &b, &200);

    assert_eq!(cf.total_raised(&id), 500);
    assert_eq!(cf.goal_reached(&id), false);
    assert_eq!(cf.contributors(&id).len(), 2);
    assert_eq!(cf.contributions(&id).len(), 2);

    // Failure path: after the deadline, owner cannot withdraw; contributors
    // reclaim exactly their own funds.
    e.ledger().set_timestamp(1000);
    cf.claim_refund(&id, &a);
    cf.claim_refund(&id, &b);

    assert_eq!(tc.balance(&a), 1000);
    assert_eq!(tc.balance(&b), 1000);
    let contract = cf.address.clone();
    assert_eq!(tc.balance(&contract), 0);
    // Contributions are zeroed, so the contributor list is now empty.
    assert_eq!(cf.contributors(&id).len(), 0);
    assert_eq!(cf.contributions(&id).len(), 0);
}

#[test]
#[should_panic(expected = "campaign closed")]
fn contribute_after_deadline_panics() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let a = Address::generate(&e);
    let (asset, tc) = create_token(&e, &owner);
    tc.mint(&a, &1000);
    let cf = create_crowdfund(&e);
    let id = cf.create_campaign(&owner, &asset, &1000, &1000);
    e.ledger().set_timestamp(1000);
    cf.contribute(&id, &a, &100);
}

#[test]
#[should_panic(expected = "campaign not ended")]
fn withdraw_before_deadline_panics() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let a = Address::generate(&e);
    let (asset, tc) = create_token(&e, &owner);
    tc.mint(&a, &1000);
    let cf = create_crowdfund(&e);
    let id = cf.create_campaign(&owner, &asset, &1000, &1000);
    cf.contribute(&id, &a, &1000);
    cf.withdraw(&id, &owner);
}

#[test]
#[should_panic(expected = "goal not reached")]
fn withdraw_when_goal_unmet_panics() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let a = Address::generate(&e);
    let (asset, tc) = create_token(&e, &owner);
    tc.mint(&a, &1000);
    let cf = create_crowdfund(&e);
    let id = cf.create_campaign(&owner, &asset, &1000, &1000);
    cf.contribute(&id, &a, &500);
    e.ledger().set_timestamp(1000);
    cf.withdraw(&id, &owner);
}

#[test]
#[should_panic(expected = "only the owner can withdraw")]
fn non_owner_withdraw_panics() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let stranger = Address::generate(&e);
    let a = Address::generate(&e);
    let (asset, tc) = create_token(&e, &owner);
    tc.mint(&a, &1000);
    let cf = create_crowdfund(&e);
    let id = cf.create_campaign(&owner, &asset, &1000, &1000);
    cf.contribute(&id, &a, &1000);
    e.ledger().set_timestamp(1000);
    // A non-owner address must be refused even with auth mocked.
    cf.withdraw(&id, &stranger);
}

#[test]
#[should_panic(expected = "already withdrawn")]
fn withdraw_twice_panics() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let a = Address::generate(&e);
    let (asset, tc) = create_token(&e, &owner);
    tc.mint(&a, &1000);
    let cf = create_crowdfund(&e);
    let id = cf.create_campaign(&owner, &asset, &1000, &1000);
    cf.contribute(&id, &a, &1000);
    e.ledger().set_timestamp(1000);
    cf.withdraw(&id, &owner);
    cf.withdraw(&id, &owner);
}

#[test]
#[should_panic(expected = "no refund available")]
fn refund_claimed_twice_panics() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let a = Address::generate(&e);
    let (asset, tc) = create_token(&e, &owner);
    tc.mint(&a, &1000);
    let cf = create_crowdfund(&e);
    let id = cf.create_campaign(&owner, &asset, &1000, &1000);
    cf.contribute(&id, &a, &500);
    e.ledger().set_timestamp(1000);
    cf.claim_refund(&id, &a);
    // Second claim (for the same contributor) must be refused.
    cf.claim_refund(&id, &a);
}

#[test]
#[should_panic(expected = "goal reached, no refunds")]
fn refund_when_goal_reached_panics() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let a = Address::generate(&e);
    let (asset, tc) = create_token(&e, &owner);
    tc.mint(&a, &1000);
    let cf = create_crowdfund(&e);
    let id = cf.create_campaign(&owner, &asset, &1000, &1000);
    cf.contribute(&id, &a, &1000);
    e.ledger().set_timestamp(1000);
    // Goal was reached, so refunds are not available.
    cf.claim_refund(&id, &a);
}

#[test]
#[should_panic(expected = "amount must be positive")]
fn rejects_zero_contribution() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let a = Address::generate(&e);
    let (asset, _tc) = create_token(&e, &owner);
    let cf = create_crowdfund(&e);
    let id = cf.create_campaign(&owner, &asset, &1000, &1000);
    cf.contribute(&id, &a, &0);
}

#[test]
#[should_panic(expected = "goal must be positive")]
fn rejects_zero_goal() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let (asset, _tc) = create_token(&e, &owner);
    let cf = create_crowdfund(&e);
    cf.create_campaign(&owner, &asset, &0, &1000);
}
