#![cfg(test)]
extern crate std;

use crate::{Oracle, OracleClient};
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    symbol_short,
    testutils::Address as _,
    Address, Bytes, Env, Timepoint,
};

const MESSAGE_PREFIX: &[u8] = b"ORACLE-V1";

fn deploy() -> TestFixture {
    let e = Env::default();
    let admin = Address::generate(&e);
    let sec = SigningKey::from_bytes(&[0x42u8; 32]);
    let sec2 = SigningKey::from_bytes(&[0x24u8; 32]);
    let signer = Bytes::from_array(&e, sec.verifying_key().as_bytes());
    let contract_id = e.register(
        Oracle,
        (admin.clone(), signer, symbol_short!("USD")),
    );
    let contract = OracleClient::new(&e, &contract_id);
    TestFixture {
        e,
        contract,
        pubkey2: sec2.verifying_key().as_bytes().to_vec(),
        sec,
        sec2,
    }
}

struct TestFixture {
    e: Env,
    contract: OracleClient<'static>,
    pubkey2: std::vec::Vec<u8>,
    sec: SigningKey,
    sec2: SigningKey,
}

/// Replicates the contract's canonical message exactly (see `signed_message`).
fn message_bytes(price: i64, timestamp: u64) -> std::vec::Vec<u8> {
    let mut m = std::vec::Vec::new();
    m.extend_from_slice(MESSAGE_PREFIX);
    m.extend_from_slice(&price.to_be_bytes());
    m.extend_from_slice(&timestamp.to_be_bytes());
    m
}

fn sign(secret: &SigningKey, price: i64, timestamp: u64) -> std::vec::Vec<u8> {
    secret.sign(&message_bytes(price, timestamp)).to_bytes().to_vec()
}

fn sig(e: &Env, raw: &[u8]) -> Bytes {
    Bytes::from_slice(e, raw)
}

fn ts(e: &Env, t: u64) -> Timepoint {
    Timepoint::from_unix(e, t)
}

#[test]
fn valid_signature_publishes() {
    let f = deploy();
    let price = 100i64;
    let t = 1_700_000_000u64;
    let s = sign(&f.sec, price, t);
    let client = &f.contract;
    assert!(client
        .try_publish(&price, &ts(&f.e, t), &sig(&f.e, &s))
        .unwrap()
        .unwrap());
    assert_eq!(client.latest_price(), price);
    assert_eq!(client.latest_time().to_unix(), t);
}

#[test]
fn preserves_negative_and_positive_prices() {
    let f = deploy();
    let client = &f.contract;

    let t1 = 1_700_000_000u64;
    let p1 = -500i64;
    let s1 = sign(&f.sec, p1, t1);
    assert!(client
        .try_publish(&p1, &ts(&f.e, t1), &sig(&f.e, &s1))
        .unwrap()
        .unwrap());
    assert_eq!(client.latest_price(), -500);

    let t2 = 1_700_000_100u64;
    let p2 = 1_000_000i64;
    let s2 = sign(&f.sec, p2, t2);
    assert!(client
        .try_publish(&p2, &ts(&f.e, t2), &sig(&f.e, &s2))
        .unwrap()
        .unwrap());
    assert_eq!(client.latest_price(), 1_000_000);
}

#[test]
fn timestamp_round_trips() {
    let f = deploy();
    let client = &f.contract;
    let t = 1_234_567_890u64;
    let s = sign(&f.sec, 42, t);
    client
        .try_publish(&42, &ts(&f.e, t), &sig(&f.e, &s))
        .unwrap()
        .unwrap();
    assert_eq!(client.latest_time().to_unix(), t);
}

#[test]
fn invalid_signature_rejected() {
    let f = deploy();
    let client = &f.contract;
    let t = 1_700_000_000u64;
    let mut bad = [0xaa; 64];
    bad[0] = 0x11;
    // Invalid signature: ed25519_verify traps, so the invocation fails (outer Err).
    let res = client.try_publish(&100, &ts(&f.e, t), &sig(&f.e, &bad));
    assert!(res.is_err());
    assert_eq!(client.latest_price(), 0);
}

#[test]
fn tampered_price_rejected() {
    let f = deploy();
    let client = &f.contract;
    let t = 1_700_000_000u64;
    let s = sign(&f.sec, 100, t); // signed for price 100
    // Tampered price invalidates the signature -> invocation fails (outer Err).
    let res = client.try_publish(&101, &ts(&f.e, t), &sig(&f.e, &s));
    assert!(res.is_err());
}

#[test]
fn tampered_timestamp_rejected() {
    let f = deploy();
    let client = &f.contract;
    let t = 1_700_000_000u64;
    let s = sign(&f.sec, 100, t); // signed for timestamp t
    // Tampered timestamp invalidates the signature -> invocation fails (outer Err).
    let res = client.try_publish(&100, &ts(&f.e, t + 1), &sig(&f.e, &s));
    assert!(res.is_err());
}

#[test]
fn replay_same_timestamp_rejected() {
    let f = deploy();
    let client = &f.contract;
    let t = 1_700_000_000u64;
    let s = sign(&f.sec, 100, t);
    assert!(client
        .try_publish(&100, &ts(&f.e, t), &sig(&f.e, &s))
        .unwrap()
        .unwrap());
    // Even a different price at the SAME timestamp must be rejected (returns false).
    let s2 = sign(&f.sec, 200, t);
    let r = client
        .try_publish(&200, &ts(&f.e, t), &sig(&f.e, &s2))
        .unwrap();
    assert_eq!(r.unwrap(), false);
}

#[test]
fn older_timestamp_rejected() {
    let f = deploy();
    let client = &f.contract;
    let t1 = 1_700_000_100u64;
    let s1 = sign(&f.sec, 100, t1);
    assert!(client
        .try_publish(&100, &ts(&f.e, t1), &sig(&f.e, &s1))
        .unwrap()
        .unwrap());
    let t0 = 1_700_000_000u64;
    let s0 = sign(&f.sec, 50, t0);
    let r = client
        .try_publish(&50, &ts(&f.e, t0), &sig(&f.e, &s0))
        .unwrap();
    assert_eq!(r.unwrap(), false);
}

#[test]
fn non_admin_cannot_rotate_signer() {
    let f = deploy();
    let client = &f.contract;
    // No auth mocked here: admin.require_auth() must fail (trap -> outer Err).
    let res = client.try_set_signer(&sig(&f.e, &f.pubkey2));
    assert!(res.is_err());
}

#[test]
fn signer_rotation_accepts_new_key() {
    let f = deploy();
    let client = &f.contract;
    f.e.mock_all_auths();
    client
        .try_set_signer(&sig(&f.e, &f.pubkey2))
        .unwrap()
        .unwrap();

    let t = 1_700_000_000u64;
    let s = sign(&f.sec2, 777, t); // signature from the NEW key
    assert!(client
        .try_publish(&777, &ts(&f.e, t), &sig(&f.e, &s))
        .unwrap()
        .unwrap());
    assert_eq!(client.latest_price(), 777);

    // The OLD key must no longer be accepted (invalid signature -> outer Err).
    let old = sign(&f.sec, 888, t + 1);
    let res = client.try_publish(&888, &ts(&f.e, t + 1), &sig(&f.e, &old));
    assert!(res.is_err());
}

#[test]
fn edge_values() {
    let f = deploy();
    let client = &f.contract;

    // First publish at epoch timestamp 0.
    let t0 = 0u64;
    let s0 = sign(&f.sec, 0, t0);
    assert!(client
        .try_publish(&0, &ts(&f.e, t0), &sig(&f.e, &s0))
        .unwrap()
        .unwrap());
    assert_eq!(client.latest_price(), 0);
    assert_eq!(client.latest_time().to_unix(), 0);

    let t1 = 1u64;
    let s1 = sign(&f.sec, i64::MIN, t1);
    assert!(client
        .try_publish(&i64::MIN, &ts(&f.e, t1), &sig(&f.e, &s1))
        .unwrap()
        .unwrap());
    assert_eq!(client.latest_price(), i64::MIN);

    let t2 = 2u64;
    let s2 = sign(&f.sec, i64::MAX, t2);
    assert!(client
        .try_publish(&i64::MAX, &ts(&f.e, t2), &sig(&f.e, &s2))
        .unwrap()
        .unwrap());
    assert_eq!(client.latest_price(), i64::MAX);
}

#[test]
fn signature_not_reusable_for_different_data() {
    let f = deploy();
    let client = &f.contract;
    let t = 1_700_000_000u64;
    let s = sign(&f.sec, 100, t); // valid for (100, t)

    // Reuse for a different price -> signature invalid -> invocation fails.
    assert!(client
        .try_publish(&200, &ts(&f.e, t), &sig(&f.e, &s))
        .is_err());
    // Reuse for a different timestamp -> signature invalid -> invocation fails.
    assert!(client
        .try_publish(&100, &ts(&f.e, t + 5), &sig(&f.e, &s))
        .is_err());
}
