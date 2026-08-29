#![cfg(test)]
extern crate std;

use std::vec::Vec;

use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Bytes, Env,
};
use crate::{combine, leaf_hash, MerkleAirdrop, MerkleAirdropClient};

fn create_token<'a>(e: &Env, admin: &Address) -> (TokenClient<'a>, StellarAssetClient<'a>) {
    let addr = e.register_stellar_asset_contract(admin.clone());
    (
        TokenClient::new(e, &addr),
        StellarAssetClient::new(e, &addr),
    )
}

/// Builds every level of a sorted-pair Merkle tree from the given leaves.
fn build_levels(e: &Env, leaves: &[Bytes]) -> Vec<Vec<Bytes>> {
    let mut levels: Vec<Vec<Bytes>> = Vec::new();
    levels.push(leaves.to_vec());
    while levels.last().unwrap().len() > 1 {
        let cur = levels.last().unwrap().clone();
        let mut next: Vec<Bytes> = Vec::new();
        let mut j = 0usize;
        while j < cur.len() {
            let l = cur[j].clone();
            let r = if j + 1 < cur.len() {
                cur[j + 1].clone()
            } else {
                cur[j].clone()
            };
            next.push(combine(e, &l, &r));
            j += 2;
        }
        levels.push(next);
    }
    levels
}

/// Produces the proof (concatenated sibling hashes) for leaf `idx`. With
/// sorted-pair hashing the only thing the verifier needs is each sibling hash.
fn proof_for(e: &Env, levels: &[Vec<Bytes>], idx: usize) -> Bytes {
    let mut proof = Bytes::new(e);
    let mut i = idx;
    let last = levels.len() - 1;
    for lvl in 0..last {
        let cur = &levels[lvl];
        let sibling = if i % 2 == 0 {
            if i + 1 < cur.len() {
                cur[i + 1].clone()
            } else {
                cur[i].clone()
            }
        } else {
            cur[i - 1].clone()
        };
        proof.append(&sibling);
        i /= 2;
    }
    proof
}

/// Builds a Merkle tree over `(index, claimant, amount)` leaves and returns the
/// root plus a per-leaf proof. The leaf encoding is identical to the contract.
fn build_tree(e: &Env, claimants: &[Address], amounts: &[i128]) -> (Bytes, Vec<Bytes>) {
    let n = claimants.len();
    let mut leaves: Vec<Bytes> = Vec::new();
    for i in 0..n {
        leaves.push(leaf_hash(e, i as u32, &claimants[i], amounts[i]));
    }
    let levels = build_levels(e, &leaves);
    let root = levels.last().unwrap()[0].clone();
    let mut proofs: Vec<Bytes> = Vec::new();
    for i in 0..n {
        proofs.push(proof_for(e, &levels, i));
    }
    (root, proofs)
}

struct Tree {
    e: Env,
    claimants: Vec<Address>,
    amounts: Vec<i128>,
    root: Bytes,
    proofs: Vec<Bytes>,
    contract_id: Address,
    token_addr: Address,
}

/// Deploys a token (minted to its admin) plus a Merkle Airdrop contract rooted
/// at the tree over `n` freshly generated recipients and `amounts`. Every object
/// is created against the SAME `Env` so cross-env "mis-tagged object" errors
/// cannot occur. The admin is funded with `sum*2` so deposit-based tests can
/// escrow the full allocation.
fn deploy_tree(n: usize, amounts: &[i128]) -> Tree {
    let e = Env::default();
    e.mock_all_auths();
    let admin = Address::generate(&e);
    let (token, token_admin) = create_token(&e, &admin);
    let sum: i128 = amounts.iter().copied().fold(0i128, |a, b| a + b);
    token_admin.mint(&admin, &(sum * 2));

    let mut claimants: Vec<Address> = Vec::new();
    for _ in 0..n {
        claimants.push(Address::generate(&e));
    }
    let (root, proofs) = build_tree(&e, &claimants, amounts);
    let contract_id = e.register(
        MerkleAirdrop,
        (admin, token.address.clone(), root.clone()),
    );
    Tree {
        e,
        claimants,
        amounts: amounts.to_vec(),
        root,
        proofs,
        contract_id,
        token_addr: token.address,
    }
}

fn client(tree: &Tree) -> MerkleAirdropClient<'_> {
    MerkleAirdropClient::new(&tree.e, &tree.contract_id)
}

fn token_client(tree: &Tree) -> TokenClient<'_> {
    TokenClient::new(&tree.e, &tree.token_addr)
}

#[test]
fn valid_single_leaf_claim() {
    let tree = deploy_tree(1, &[1_000i128]);
    let c = client(&tree);
    let token = token_client(&tree);

    let before = token.balance(&tree.claimants[0]);
    c.deposit(&tree.amounts[0]);
    c.claim(&0u32, &tree.claimants[0], &tree.amounts[0], &tree.proofs[0]);
    let after = token.balance(&tree.claimants[0]);

    assert_eq!(after - before, 1_000i128);
    assert_eq!(c.claimed(&0u32), true);
}

#[test]
fn valid_multi_level_merkle_proof() {
    let amounts = [10i128, 20, 30, 40];
    let tree = deploy_tree(4, &amounts);
    let c = client(&tree);
    let token = token_client(&tree);

    let total: i128 = amounts.iter().copied().fold(0, |a, b| a + b);
    c.deposit(&total);

    for i in 0..4 {
        let claimant = &tree.claimants[i];
        let before = token.balance(claimant);
        c.claim(&(i as u32), claimant, &amounts[i], &tree.proofs[i]);
        let after = token.balance(claimant);
        assert_eq!(after - before, amounts[i], "leaf {i} payout");
        assert_eq!(c.claimed(&(i as u32)), true);
    }

    assert_eq!(token.balance(&tree.contract_id), 0);
}

#[test]
fn invalid_proof_rejected() {
    let tree = deploy_tree(1, &[1_000i128]);
    let c = client(&tree);
    c.deposit(&tree.amounts[0]);

    let mut bad = [0xffu8; 32];
    bad[0] = 0xab;
    let bad_proof = Bytes::from_slice(&tree.e, &bad);
    assert!(c
        .try_claim(&0u32, &tree.claimants[0], &tree.amounts[0], &bad_proof)
        .is_err());
}

#[test]
fn wrong_claimant_rejected() {
    let tree = deploy_tree(1, &[1_000i128]);
    let c = client(&tree);
    c.deposit(&tree.amounts[0]);
    let other = Address::generate(&tree.e);

    // Proof was built for the real claimant; claiming as `other` commits to a
    // different leaf, so verification must fail.
    assert!(c
        .try_claim(&0u32, &other, &tree.amounts[0], &tree.proofs[0])
        .is_err());
}

#[test]
fn wrong_amount_rejected() {
    let tree = deploy_tree(1, &[1_000i128]);
    let c = client(&tree);
    c.deposit(&tree.amounts[0]);

    assert!(c
        .try_claim(&0u32, &tree.claimants[0], &(tree.amounts[0] + 1), &tree.proofs[0])
        .is_err());
}

#[test]
fn wrong_index_rejected() {
    let tree = deploy_tree(2, &[100i128, 200i128]);
    let c = client(&tree);
    c.deposit(&300i128);

    // Proof[0] is bound to index 0; claiming index 1 with it commits to a
    // different leaf and must fail.
    assert!(c
        .try_claim(&1u32, &tree.claimants[0], &tree.amounts[0], &tree.proofs[0])
        .is_err());
}

#[test]
fn double_claim_rejected() {
    let tree = deploy_tree(1, &[1_000i128]);
    let c = client(&tree);
    c.deposit(&tree.amounts[0]);
    c.claim(&0u32, &tree.claimants[0], &tree.amounts[0], &tree.proofs[0]);
    assert!(c
        .try_claim(&0u32, &tree.claimants[0], &tree.amounts[0], &tree.proofs[0])
        .is_err());
}

#[test]
fn zero_and_negative_amount_rejected() {
    let tree = deploy_tree(1, &[1_000i128]);
    let c = client(&tree);

    assert!(c
        .try_claim(&0u32, &tree.claimants[0], &0i128, &tree.proofs[0])
        .is_err());
    assert!(c
        .try_claim(&0u32, &tree.claimants[0], &-1i128, &tree.proofs[0])
        .is_err());
}

#[test]
fn insufficient_contract_balance_rejected() {
    let tree = deploy_tree(1, &[1_000i128]);
    let c = client(&tree);
    // Only deposit half of the claimable amount.
    c.deposit(&500i128);
    assert!(c
        .try_claim(&0u32, &tree.claimants[0], &tree.amounts[0], &tree.proofs[0])
        .is_err());
    // The failed claim must NOT have marked the index claimed.
    assert_eq!(c.claimed(&0u32), false);
}

#[test]
fn unauthorized_deposit_rejected() {
    let tree = deploy_tree(1, &[1_000i128]);
    let c = client(&tree);
    tree.e.set_auths(&[]);
    assert!(c.try_deposit(&tree.amounts[0]).is_err());
}

#[test]
fn unauthorized_root_update_rejected() {
    let tree = deploy_tree(1, &[1_000i128]);
    let c = client(&tree);
    tree.e.set_auths(&[]);
    let new_root = Bytes::from_slice(&tree.e, &[0xcd; 32]);
    assert!(c.try_update_root(&new_root).is_err());
}

#[test]
fn valid_root_update_and_old_root_rejected() {
    // Deploy a 2-leaf tree, escrow the full allocation, then rotate the root.
    // After rotation a claim carrying the OLD proof must be rejected, while a
    // claim carrying a NEW proof (for a fresh root) succeeds and moves tokens.
    let tree = deploy_tree(2, &[100i128, 200i128]);
    let c = client(&tree);
    let token = token_client(&tree);
    c.deposit(&300i128);

    let new_claimant = Address::generate(&tree.e);
    let (new_root, new_proofs) = build_tree(&tree.e, &[new_claimant.clone()], &[50i128]);
    c.update_root(&new_root);

    // Old proof no longer matches the new root: reject the previously-valid leaf.
    assert!(c
        .try_claim(&0u32, &tree.claimants[0], &100i128, &tree.proofs[0])
        .is_err());

    // New root + new proof works and moves tokens (admin still holds enough).
    let before = token.balance(&new_claimant);
    c.deposit(&50i128);
    c.claim(&0u32, &new_claimant, &50i128, &new_proofs[0]);
    let after = token.balance(&new_claimant);
    assert_eq!(after - before, 50i128);
    // claimed state persists after the root rotation.
    assert_eq!(c.claimed(&0u32), true);
}

#[test]
fn claimed_state_is_persistent() {
    let tree = deploy_tree(1, &[1_000i128]);
    let c = client(&tree);
    assert_eq!(c.claimed(&0u32), false);
    c.deposit(&tree.amounts[0]);
    c.claim(&0u32, &tree.claimants[0], &tree.amounts[0], &tree.proofs[0]);
    // Persistence: the flag survives further contract reads and rejects reuse.
    assert_eq!(c.claimed(&0u32), true);
    assert!(c
        .try_claim(&0u32, &tree.claimants[0], &tree.amounts[0], &tree.proofs[0])
        .is_err());
}

#[test]
fn successful_transfer_changes_balances() {
    let tree = deploy_tree(1, &[1_000i128]);
    let c = client(&tree);
    let token = token_client(&tree);

    let contract_before = token.balance(&tree.contract_id);
    let claimant_before = token.balance(&tree.claimants[0]);
    c.deposit(&tree.amounts[0]);
    let contract_escrowed = token.balance(&tree.contract_id);
    c.claim(&0u32, &tree.claimants[0], &tree.amounts[0], &tree.proofs[0]);

    assert_eq!(contract_escrowed - contract_before, 1_000i128);
    assert_eq!(token.balance(&tree.contract_id), contract_before);
    assert_eq!(
        token.balance(&tree.claimants[0]) - claimant_before,
        1_000i128
    );
}

#[test]
fn root_return_is_real_bytes() {
    let tree = deploy_tree(1, &[1_000i128]);
    let c = client(&tree);
    // The stored root must round-trip exactly through root().
    assert!(crate::bytes_eq(&c.root(), &tree.root));
}

#[test]
fn combine_is_order_independent() {
    let e = Env::default();
    let a = Bytes::from_slice(&e, &[0x01; 32]);
    let b = Bytes::from_slice(&e, &[0x02; 32]);
    // Sorted-pair hashing must yield the same parent regardless of argument order.
    assert!(crate::bytes_eq(
        &combine(&e, &a, &b),
        &combine(&e, &b, &a)
    ));
}
