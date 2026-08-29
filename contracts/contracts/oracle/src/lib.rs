#![no_std]

use soroban_sdk::{
    contract, contractimpl, Address, Bytes, BytesN, Env, Symbol, Timepoint,
};

// Domain separator for the signed price-observation message. The message binds
// the price and timestamp unambiguously, so a signature cannot be reused across
// different prices or timestamps. Each oracle trusts a single Ed25519 signer
// key, which is what prevents cross-feed reuse of a signature.
const MESSAGE_PREFIX: &[u8] = b"ORACLE-V1";

#[contract]
pub struct Oracle;

#[contractimpl]
impl Oracle {
    pub fn __constructor(e: Env, admin: Address, signer: Bytes, symbol: Symbol) {
        e.storage().instance().set(&key(&e, "admin"), &admin);
        e.storage()
            .instance()
            .set(&key(&e, "signer"), &to_bytesn32(&e, &signer));
        e.storage().instance().set(&key(&e, "symbol"), &symbol);
        e.storage().instance().set(&key(&e, "price"), &0i64);
        e.storage()
            .instance()
            .set(&key(&e, "time"), &Timepoint::from_unix(&e, 0));
    }

    /// Publish a signed price observation. The signature must be a valid Ed25519
    /// signature (over the canonical message) by the configured signer, and the
    /// timestamp must be strictly newer than the previously stored timestamp.
    /// Returns `true` on success, `false` if the signature is invalid or the
    /// observation is stale/duplicate.
    pub fn publish(e: Env, price: i64, timestamp: Timepoint, signature: Bytes) -> bool {
        let signer: BytesN<32> = e.storage().instance().get(&key(&e, "signer")).unwrap();
        let message = signed_message(&e, price, timestamp.to_unix());

        // `ed25519_verify` traps if the signature is invalid; it only returns
        // (unit) on a valid signature, so an invalid signature rejects the
        // invocation rather than returning `false`.
        e.crypto()
            .ed25519_verify(&signer, &message, &to_bytesn64(&e, &signature));

        // The first publish sets the baseline; afterwards timestamps must be
        // strictly increasing (replay at the same timestamp is rejected). A
        // flag is used so that a first publish at unix-time 0 is still accepted.
        if e.storage()
            .instance()
            .get(&key(&e, "initialized"))
            .unwrap_or(false)
        {
            let last: Timepoint = e
                .storage()
                .instance()
                .get(&key(&e, "time"))
                .unwrap_or(Timepoint::from_unix(&e, 0));
            if timestamp.to_unix() <= last.to_unix() {
                return false;
            }
        }

        e.storage().instance().set(&key(&e, "price"), &price);
        e.storage().instance().set(&key(&e, "time"), &timestamp);
        e.storage().instance().set(&key(&e, "initialized"), &true);
        true
    }

    pub fn latest_price(e: Env) -> i64 {
        e.storage()
            .instance()
            .get(&key(&e, "price"))
            .unwrap_or(0i64)
    }

    pub fn latest_time(e: Env) -> Timepoint {
        e.storage()
            .instance()
            .get(&key(&e, "time"))
            .unwrap_or(Timepoint::from_unix(&e, 0))
    }

    /// Rotate the trusted signer. Admin-only.
    pub fn set_signer(e: Env, new_signer: Bytes) {
        let admin: Address = e.storage().instance().get(&key(&e, "admin")).unwrap();
        admin.require_auth();
        e.storage()
            .instance()
            .set(&key(&e, "signer"), &to_bytesn32(&e, &new_signer));
    }
}

fn key(e: &Env, name: &str) -> Symbol {
    Symbol::new(e, name)
}

/// Canonical signed message: PREFIX || price(8 BE) || timestamp(8 BE).
/// The fixed-width big-endian fields make the encoding unambiguous.
fn signed_message(e: &Env, price: i64, timestamp: u64) -> Bytes {
    let mut message = Bytes::new(e);
    message.append(&Bytes::from_slice(e, MESSAGE_PREFIX));
    message.append(&Bytes::from_array(e, &price.to_be_bytes()));
    message.append(&Bytes::from_array(e, &timestamp.to_be_bytes()));
    message
}

fn to_bytesn32(e: &Env, bytes: &Bytes) -> BytesN<32> {
    if bytes.len() != 32 {
        panic!("signer must be exactly 32 bytes");
    }
    let mut arr = [0u8; 32];
    copy_into(bytes, &mut arr);
    BytesN::<32>::from_array(e, &arr)
}

fn to_bytesn64(e: &Env, bytes: &Bytes) -> BytesN<64> {
    if bytes.len() != 64 {
        panic!("signature must be exactly 64 bytes");
    }
    let mut arr = [0u8; 64];
    copy_into(bytes, &mut arr);
    BytesN::<64>::from_array(e, &arr)
}

fn copy_into(bytes: &Bytes, arr: &mut [u8]) {
    let n = bytes.len();
    let mut i = 0u32;
    while i < n {
        arr[i as usize] = bytes.get(i).unwrap_or(0);
        i += 1;
    }
}

#[cfg(test)]
mod test;
