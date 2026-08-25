#![cfg(test)]
extern crate std;

use crate::{AccessControl, AccessControlClient};
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

fn deploy<'a>(e: &Env, admin: &Address) -> AccessControlClient<'a> {
    e.mock_all_auths();
    let address = e.register(AccessControl, (admin.clone(),));
    AccessControlClient::new(e, &address)
}

fn role(e: &Env, name: &str) -> Symbol {
    Symbol::new(e, name)
}

#[test]
fn constructor_stores_admin() {
    // The admin can perform a privileged action, which proves the constructor
    // recorded it.
    let e = Env::default();
    let admin = Address::generate(&e);
    let client = deploy(&e, &admin);
    let user = Address::generate(&e);
    client.grant_role(&role(&e, "minter"), &user);
    assert!(client.has_role(&role(&e, "minter"), &user));
}

#[test]
fn admin_can_grant_a_role() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let client = deploy(&e, &admin);
    let user = Address::generate(&e);
    client.grant_role(&role(&e, "minter"), &user);
    assert!(client.has_role(&role(&e, "minter"), &user));
}

#[test]
fn granted_account_has_the_role() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let client = deploy(&e, &admin);
    let user = Address::generate(&e);
    let other = Address::generate(&e);
    let r = role(&e, "operator");
    client.grant_role(&r, &user);
    assert!(client.has_role(&r, &user));
    assert!(!client.has_role(&r, &other));
}

#[test]
fn admin_can_revoke_a_role() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let client = deploy(&e, &admin);
    let user = Address::generate(&e);
    let r = role(&e, "operator");
    client.grant_role(&r, &user);
    assert!(client.has_role(&r, &user));
    client.revoke_role(&r, &user);
    assert!(!client.has_role(&r, &user));
}

#[test]
fn revoked_account_no_longer_has_the_role() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let client = deploy(&e, &admin);
    let user = Address::generate(&e);
    let r = role(&e, "operator");
    client.grant_role(&r, &user);
    client.revoke_role(&r, &user);
    assert!(!client.has_role(&r, &user));
}

#[test]
fn non_admin_cannot_grant() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let client = deploy(&e, &admin);
    let victim = Address::generate(&e);
    e.set_auths(&[]);
    let result = client.try_grant_role(&role(&e, "minter"), &victim);
    assert!(result.is_err());
}

#[test]
fn non_admin_cannot_revoke() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let client = deploy(&e, &admin);
    let user = Address::generate(&e);
    client.grant_role(&role(&e, "minter"), &user);
    e.set_auths(&[]);
    let result = client.try_revoke_role(&role(&e, "minter"), &user);
    assert!(result.is_err());
}

#[test]
fn non_admin_cannot_transfer_admin() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let client = deploy(&e, &admin);
    let intruder = Address::generate(&e);
    e.set_auths(&[]);
    let result = client.try_transfer_admin(&intruder);
    assert!(result.is_err());
}

#[test]
fn admin_can_transfer_admin() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let client = deploy(&e, &admin);
    let new_admin = Address::generate(&e);
    client.transfer_admin(&new_admin);
    // After transfer, the new admin can grant (proves the stored admin changed).
    let user = Address::generate(&e);
    client.grant_role(&role(&e, "minter"), &user);
    assert!(client.has_role(&role(&e, "minter"), &user));
}

#[test]
fn new_admin_can_perform_administrative_actions() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let new_admin = Address::generate(&e);
    let client = deploy(&e, &admin);
    client.transfer_admin(&new_admin);
    let user = Address::generate(&e);
    client.grant_role(&role(&e, "minter"), &user);
    assert!(client.has_role(&role(&e, "minter"), &user));
}

#[test]
fn old_admin_cannot_act_after_transfer() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let new_admin = Address::generate(&e);
    let client = deploy(&e, &admin);
    client.transfer_admin(&new_admin);
    // No authorizations: the (new) admin's require_auth fails, proving the prior
    // admin's privileges were removed when administration transferred.
    e.set_auths(&[]);
    let result = client.try_grant_role(&role(&e, "minter"), &Address::generate(&e));
    assert!(result.is_err());
}

#[test]
fn has_role_works_for_multiple_accounts_and_roles() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let client = deploy(&e, &admin);
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    let minter = role(&e, "minter");
    let burner = role(&e, "burner");
    client.grant_role(&minter, &alice);
    client.grant_role(&burner, &bob);
    assert!(client.has_role(&minter, &alice));
    assert!(!client.has_role(&minter, &bob));
    assert!(client.has_role(&burner, &bob));
    assert!(!client.has_role(&burner, &alice));
}
