#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Bytes, Env, Map, Symbol};
use soroban_sdk::token::TokenClient;

/// Domain separator for leaf commits. Keeps a Merkle leaf unambiguously bound to
/// this contract so a leaf from another system cannot be replayed here.
const LEAF_DOMAIN: &[u8] = b"MERKLE-AIRDROP-V1";

const ADMIN_KEY: &str = "admin";
const ASSET_KEY: &str = "asset";
const ROOT_KEY: &str = "root";
const CLAIMED_KEY: &str = "claimed";

fn admin_key(e: &Env) -> Symbol {
    Symbol::new(e, ADMIN_KEY)
}
fn asset_key(e: &Env) -> Symbol {
    Symbol::new(e, ASSET_KEY)
}
fn root_key(e: &Env) -> Symbol {
    Symbol::new(e, ROOT_KEY)
}
fn claimed_key(e: &Env) -> Symbol {
    Symbol::new(e, CLAIMED_KEY)
}

fn load_admin(e: &Env) -> Address {
    e.storage()
        .instance()
        .get(&admin_key(e))
        .expect("admin not set")
}
fn load_asset(e: &Env) -> Address {
    e.storage()
        .instance()
        .get(&asset_key(e))
        .expect("asset not set")
}
fn load_root(e: &Env) -> Bytes {
    e.storage()
        .instance()
        .get(&root_key(e))
        .expect("root not set")
}
fn load_claimed(e: &Env) -> Map<u32, bool> {
    e.storage()
        .instance()
        .get(&claimed_key(e))
        .unwrap_or(Map::new(e))
}
fn save_claimed(e: &Env, claimed: &Map<u32, bool>) {
    e.storage().instance().set(&claimed_key(e), claimed);
}

/// Returns the SHA-256 hash of `a` followed by `b` where the two 32-byte hashes
/// are sorted lexicographically by byte content first (sorted-pair hashing).
///
/// Sorting the pair before hashing means the *order* of the two children never
/// needs to be encoded in the proof: the verifier simply combines the running
/// hash with each sibling using the same sorted rule.
pub fn combine(e: &Env, a: &Bytes, b: &Bytes) -> Bytes {
    let (left, right) = if bytes_lt(a, b) {
        (a.clone(), b.clone())
    } else {
        (b.clone(), a.clone())
    };
    let mut buf = Bytes::new(e);
    buf.append(&left);
    buf.append(&right);
    Bytes::from(e.crypto().sha256(&buf))
}

/// Leaf commitment: SHA-256( DOMAIN || index:u32 || claimant_strkey || amount:i128 ).
///
/// The commit binds the leaf to `(index, claimant, amount)` so a proof can only
/// be reused for the exact same (index, claimant, amount) tuple. The same
/// encoding is used by the contract, the Rust tests, and the sandbox fixtures.
pub fn leaf_hash(e: &Env, index: u32, claimant: &Address, amount: i128) -> Bytes {
    let mut buf = Bytes::new(e);
    buf.append(&Bytes::from_slice(e, LEAF_DOMAIN));
    buf.append(&Bytes::from_slice(e, &index.to_be_bytes()));
    buf.append(&claimant.to_string().to_bytes());
    buf.append(&Bytes::from_slice(e, &amount.to_be_bytes()));
    Bytes::from(e.crypto().sha256(&buf))
}

/// Verifies a `proof` (a concatenation of 32-byte sibling hashes) against `leaf`
/// and the stored `root`. Returns false on malformed proof length or mismatch.
pub fn verify_proof(e: &Env, leaf: &Bytes, proof: &Bytes, root: &Bytes) -> bool {
    if proof.len() % 32 != 0 {
        return false;
    }
    let count = proof.len() / 32;
    let mut computed = leaf.clone();
    let mut i = 0u32;
    while i < count {
        let sibling = proof.slice(i * 32..i * 32 + 32);
        computed = combine(e, &computed, &sibling);
        i += 1;
    }
    bytes_eq(&computed, root)
}

fn bytes_lt(a: &Bytes, b: &Bytes) -> bool {
    let n = a.len().min(b.len());
    let mut i = 0u32;
    while i < n {
        let av = a.get(i).unwrap_or(0);
        let bv = b.get(i).unwrap_or(0);
        if av < bv {
            return true;
        }
        if av > bv {
            return false;
        }
        i += 1;
    }
    a.len() < b.len()
}

fn bytes_eq(a: &Bytes, b: &Bytes) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let n = a.len();
    let mut i = 0u32;
    while i < n {
        if a.get(i) != b.get(i) {
            return false;
        }
        i += 1;
    }
    true
}

#[contract]
pub struct MerkleAirdrop;

#[contractimpl]
impl MerkleAirdrop {
    pub fn __constructor(e: &Env, admin: Address, asset: Address, root: Bytes) {
        e.storage().instance().set(&admin_key(e), &admin);
        e.storage().instance().set(&asset_key(e), &asset);
        e.storage().instance().set(&root_key(e), &root);
    }

    /// Admin-funded escrow of `amount` of the asset into the contract. Authorized
    /// by the admin.
    pub fn deposit(e: &Env, amount: i128) {
        if amount <= 0 {
            panic!("amount must be positive");
        }
        load_admin(e).require_auth();
        let admin = load_admin(e);
        let asset = load_asset(e);
        let contract = e.current_contract_address();
        TokenClient::new(e, &asset).transfer(&admin, &contract, &amount);
    }

    /// Claims the allocation for `index` on behalf of `claimant` if `proof`
    /// certifies `(index, claimant, amount)` under the stored root. Authorized
    /// by `claimant`. Rejects invalid/already-claimed/zero entries.
    pub fn claim(e: &Env, index: u32, claimant: Address, amount: i128, proof: Bytes) {
        if amount <= 0 {
            panic!("amount must be positive");
        }
        let mut claimed = load_claimed(e);
        if claimed.get(index).unwrap_or(false) {
            panic!("already claimed");
        }
        let root = load_root(e);
        let leaf = leaf_hash(e, index, &claimant, amount);
        if !verify_proof(e, &leaf, &proof, &root) {
            panic!("invalid merkle proof");
        }
        claimant.require_auth();
        let asset = load_asset(e);
        let contract = e.current_contract_address();
        TokenClient::new(e, &asset).transfer(&contract, &claimant, &amount);
        claimed.set(index, true);
        save_claimed(e, &claimed);
    }

    /// Whether `index` has already been claimed.
    pub fn claimed(e: &Env, index: u32) -> bool {
        load_claimed(e).get(index).unwrap_or(false)
    }

    /// The currently active Merkle root.
    pub fn root(e: &Env) -> Bytes {
        load_root(e)
    }

    /// Replaces the active Merkle root. Authorized by the admin.
    pub fn update_root(e: &Env, new_root: Bytes) {
        load_admin(e).require_auth();
        e.storage().instance().set(&root_key(e), &new_root);
    }
}

#[cfg(test)]
mod test;
