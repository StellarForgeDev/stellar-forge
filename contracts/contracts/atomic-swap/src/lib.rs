#![no_std]

//! Atomic Swap — a reusable two-party atomic asset exchange.
//!
//! An offerer publishes an offer: "I will give `offer_amount` of
//! `offer_asset` in return for `ask_amount` of `ask_asset`." The contract
//! records the offer and the offerer pre-approves the contract on the offered
//! asset. A taker (entrant) executes the offer; the contract then atomically
//! pulls the ask asset from the entrant (to the offerer) and the offer asset
//! from the offerer (to the entrant). Both pulls happen inside a single
//! contract call, so the swap is all-or-nothing — there is no partial state.
//!
//! This is deliberately a minimal exchange primitive, not an AMM or order
//! book. The contract is the sole spender: it approves itself on each asset
//! (using the caller's auth) and pulls via `transfer_from`, so a taker cannot
//! redirect the exchange to a different asset than the one stored on the offer.

use soroban_sdk::{
    contract, contractimpl, contracttype,
    token::Client as TokenClient,
    Address, Env, Map, Symbol,
};

#[contracttype]
#[derive(Clone, Debug)]
pub struct Offer {
    pub offerer: Address,
    pub offer_asset: Address,
    pub offer_amount: i128,
    pub ask_asset: Address,
    pub ask_amount: i128,
    pub active: bool,
}

#[contract]
pub struct AtomicSwap;

fn offers_key(e: &Env) -> Symbol {
    Symbol::new(e, "offers")
}

fn next_id_key(e: &Env) -> Symbol {
    Symbol::new(e, "next_id")
}

fn live(e: &Env) -> u32 {
    // Token allowances are temporary entries bounded by the network max TTL,
    // so keep the horizon under it by tying it to the current ledger.
    e.ledger().sequence().saturating_add(5_000_000)
}

fn load_offers(e: &Env) -> Map<u64, Offer> {
    e.storage()
        .persistent()
        .get(&offers_key(e))
        .unwrap_or_else(|| Map::new(e))
}

fn save_offers(e: &Env, offers: &Map<u64, Offer>) {
    e.storage().persistent().set(&offers_key(e), offers);
}

fn next_id(e: &Env) -> u64 {
    let key = next_id_key(e);
    let id: u64 = e.storage().persistent().get(&key).unwrap_or(0);
    e.storage().persistent().set(&key, &(id + 1));
    id
}

#[contractimpl]
impl AtomicSwap {
    /// Stateless init. Offers are stored per id, so the constructor takes no
    /// arguments.
    pub fn __constructor(_e: &Env) {}

    /// Publish an offer: the offerer gives `offer_amount` of `offer_asset` for
    /// `ask_amount` of `ask_asset`. The contract pre-approves itself on the
    /// offered asset so it can pull at execution. Returns the new offer id.
    ///
    /// Authorization: `offerer` must authorize.
    pub fn create_offer(
        e: &Env,
        offerer: Address,
        offer_asset: Address,
        offer_amount: i128,
        ask_asset: Address,
        ask_amount: i128,
    ) -> u64 {
        if offer_asset == ask_asset {
            panic!("offer and ask assets must differ");
        }
        if offer_amount <= 0 || ask_amount <= 0 {
            panic!("amounts must be positive");
        }
        offerer.require_auth();
        let contract = e.current_contract_address();
        // Let the contract pull the offered asset from the offerer at execution.
        TokenClient::new(e, &offer_asset).approve(&offerer, &contract, &offer_amount, &live(e));
        let mut offers = load_offers(e);
        let id = next_id(e);
        offers.set(
            id,
            Offer {
                offerer,
                offer_asset,
                offer_amount,
                ask_asset,
                ask_amount,
                active: true,
            },
        );
        save_offers(e, &offers);
        id
    }

    /// Fill `offer_id`: atomically pull the ask asset from the entrant (to the
    /// offerer) and the offer asset from the offerer (to the entrant), then
    /// mark the offer inactive. The swap is all-or-nothing.
    ///
    /// Authorization: `entrant` must authorize.
    pub fn execute(e: &Env, entrant: Address, offer_id: u64) {
        entrant.require_auth();
        let mut offers = load_offers(e);
        let offer = offers.get(offer_id).expect("no such offer");
        if !offer.active {
            panic!("offer is not active");
        }
        let contract = e.current_contract_address();
        // Let the contract pull the ask asset from the entrant at execution.
        TokenClient::new(e, &offer.ask_asset).approve(&entrant, &contract, &offer.ask_amount, &live(e));
        // Atomic pulls: both happen, or the whole call reverts.
        TokenClient::new(e, &offer.ask_asset).transfer_from(
            &contract,
            &entrant,
            &offer.offerer,
            &offer.ask_amount,
        );
        TokenClient::new(e, &offer.offer_asset).transfer_from(
            &contract,
            &offer.offerer,
            &entrant,
            &offer.offer_amount,
        );
        let mut done = offer;
        done.active = false;
        offers.set(offer_id, done);
        save_offers(e, &offers);
    }

    /// Cancel an unfilled offer. Only the original offerer may cancel.
    ///
    /// Authorization: `offerer` must authorize.
    pub fn cancel_offer(e: &Env, offerer: Address, offer_id: u64) {
        offerer.require_auth();
        let mut offers = load_offers(e);
        let offer = offers.get(offer_id).expect("no such offer");
        if offer.offerer != offerer {
            panic!("only the offerer can cancel");
        }
        if !offer.active {
            panic!("offer is not active");
        }
        let mut cancelled = offer;
        cancelled.active = false;
        offers.set(offer_id, cancelled);
        save_offers(e, &offers);
    }

    /// Whether `offer_id` is still active (published, unfilled, uncancelled).
    pub fn offer_active(e: &Env, offer_id: u64) -> bool {
        load_offers(e)
            .get(offer_id)
            .map(|offer| offer.active)
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod test;
