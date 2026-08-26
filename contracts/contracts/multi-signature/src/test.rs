#![cfg(test)]
extern crate std;

use crate::{MultiSignature, MultiSignatureClient};
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

fn deploy<'a>(
    e: &Env,
    s1: &Address,
    s2: &Address,
    s3: &Address,
    threshold: u32,
) -> MultiSignatureClient<'a> {
    e.mock_all_auths();
    let address = e.register(
        MultiSignature,
        (s1.clone(), s2.clone(), s3.clone(), threshold),
    );
    MultiSignatureClient::new(e, &address)
}

fn prop(e: &Env, name: &str) -> Symbol {
    Symbol::new(e, name)
}

#[test]
fn starts_unapproved() {
    let e = Env::default();
    let s1 = Address::generate(&e);
    let s2 = Address::generate(&e);
    let s3 = Address::generate(&e);
    let client = deploy(&e, &s1, &s2, &s3, 2);
    assert!(!client.is_approved(&prop(&e, "p1")));
}

#[test]
fn insufficient_approvals() {
    let e = Env::default();
    let s1 = Address::generate(&e);
    let s2 = Address::generate(&e);
    let s3 = Address::generate(&e);
    let client = deploy(&e, &s1, &s2, &s3, 2);
    client.approve(&s1, &prop(&e, "p1"));
    assert!(!client.is_approved(&prop(&e, "p1")));
    assert!(!client.execute(&prop(&e, "p1")));
}

#[test]
fn sufficient_approvals() {
    let e = Env::default();
    let s1 = Address::generate(&e);
    let s2 = Address::generate(&e);
    let s3 = Address::generate(&e);
    let client = deploy(&e, &s1, &s2, &s3, 2);
    client.approve(&s1, &prop(&e, "p1"));
    client.approve(&s2, &prop(&e, "p1"));
    assert!(client.is_approved(&prop(&e, "p1")));
    assert!(client.execute(&prop(&e, "p1")));
}

#[test]
fn duplicate_approval_is_idempotent() {
    let e = Env::default();
    let s1 = Address::generate(&e);
    let s2 = Address::generate(&e);
    let s3 = Address::generate(&e);
    let client = deploy(&e, &s1, &s2, &s3, 2);
    client.approve(&s1, &prop(&e, "p1"));
    client.approve(&s1, &prop(&e, "p1")); // duplicate, ignored
    assert!(!client.is_approved(&prop(&e, "p1"))); // still only one distinct
}

#[test]
fn non_signer_cannot_approve() {
    let e = Env::default();
    let s1 = Address::generate(&e);
    let s2 = Address::generate(&e);
    let s3 = Address::generate(&e);
    let intruder = Address::generate(&e);
    let client = deploy(&e, &s1, &s2, &s3, 2);
    let result = client.try_approve(&intruder, &prop(&e, "p1"));
    assert!(result.is_err());
}

#[test]
fn is_approved_returns_bool() {
    let e = Env::default();
    let s1 = Address::generate(&e);
    let s2 = Address::generate(&e);
    let s3 = Address::generate(&e);
    let client = deploy(&e, &s1, &s2, &s3, 2);
    let before: bool = client.is_approved(&prop(&e, "p1"));
    assert_eq!(before, false);
    client.approve(&s1, &prop(&e, "p1"));
    client.approve(&s2, &prop(&e, "p1"));
    let after: bool = client.is_approved(&prop(&e, "p1"));
    assert_eq!(after, true);
}
