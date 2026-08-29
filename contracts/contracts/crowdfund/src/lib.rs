#![no_std]

//! Simple Crowdfund — a minimal, reusable fixed-deadline funding campaign.
//!
//! A single owner creates a campaign with a funding `goal` (in a SEP-41 asset)
//! and a `deadline` (a ledger timestamp). Contributors send the asset to the
//! contract before the deadline. After the deadline:
//!   * if the goal was reached, only the owner may withdraw the full balance;
//!   * if the goal was not reached, each contributor may claim a refund of
//!     exactly their own contribution.
//!
//! This is deliberately not a DAO, governance system, token issuer, AMM, or
//! multi-round platform. Funds are held in the contract and can always be
//! resolved: either the owner withdraws on success, or contributors reclaim on
//! failure. Withdrawals and refunds are each single-use.

use soroban_sdk::{
    contract, contractimpl, contracttype,
    token::Client as TokenClient,
    Address, Env, Map, Symbol, Vec,
};

const LEDGER_DURATION: u32 = 5_000_000;

#[contracttype]
#[derive(Clone, Debug)]
pub struct Campaign {
    pub owner: Address,
    pub asset: Address,
    pub goal: i128,
    pub deadline: u64,
    pub total: i128,
    pub withdrawn: bool,
    pub contributions: Map<Address, i128>,
}

#[contract]
pub struct Crowdfund;

fn campaigns_key(e: &Env) -> Symbol {
    Symbol::new(e, "campaigns")
}

fn next_id_key(e: &Env) -> Symbol {
    Symbol::new(e, "next_id")
}

fn live(e: &Env) -> u32 {
    // Token allowances are temporary entries bounded by the network max TTL,
    // so keep the horizon under it by tying it to the current ledger.
    e.ledger().sequence().saturating_add(LEDGER_DURATION)
}

fn load_campaigns(e: &Env) -> Map<u64, Campaign> {
    e.storage()
        .persistent()
        .get(&campaigns_key(e))
        .unwrap_or_else(|| Map::new(e))
}

fn save_campaigns(e: &Env, campaigns: &Map<u64, Campaign>) {
    e.storage().persistent().set(&campaigns_key(e), campaigns);
}

fn next_id(e: &Env) -> u64 {
    let key = next_id_key(e);
    let id: u64 = e.storage().persistent().get(&key).unwrap_or(0);
    e.storage().persistent().set(&key, &(id + 1));
    id
}

#[contractimpl]
impl Crowdfund {
    /// Stateless init. Campaigns are stored per id, so the constructor takes no
    /// arguments.
    pub fn __constructor(_e: &Env) {}

    /// Create a campaign. `owner` collects funds on success; `asset` is the
    /// SEP-41 token contributors must send; `goal` is the target amount;
    /// `deadline` is a ledger timestamp after which the campaign is closed.
    /// Returns the new campaign id.
    ///
    /// Authorization: `owner` must authorize.
    pub fn create_campaign(
        e: &Env,
        owner: Address,
        asset: Address,
        goal: i128,
        deadline: u64,
    ) -> u64 {
        if goal <= 0 {
            panic!("goal must be positive");
        }
        owner.require_auth();
        let mut campaigns = load_campaigns(e);
        let id = next_id(e);
        campaigns.set(
            id,
            Campaign {
                owner,
                asset,
                goal,
                deadline,
                total: 0,
                withdrawn: false,
                contributions: Map::new(e),
            },
        );
        save_campaigns(e, &campaigns);
        id
    }

    /// Contribute `amount` of the campaign's asset. Only allowed before the
    /// deadline and for a positive amount. The asset is pulled into the
    /// contract. Tracks the caller's cumulative contribution.
    ///
    /// Authorization: `caller` (the contributor) must authorize.
    pub fn contribute(e: &Env, campaign_id: u64, contributor: Address, amount: i128) {
        if amount <= 0 {
            panic!("amount must be positive");
        }
        contributor.require_auth();
        let mut campaigns = load_campaigns(e);
        let mut campaign = campaigns.get(campaign_id).expect("no such campaign");
        if e.ledger().timestamp() >= campaign.deadline {
            panic!("campaign closed");
        }
        let contract = e.current_contract_address();
        let token = TokenClient::new(e, &campaign.asset);
        token.approve(&contributor, &contract, &amount, &live(e));
        token.transfer_from(&contract, &contributor, &contract, &amount);
        let so_far = campaign.contributions.get(contributor.clone()).unwrap_or(0);
        campaign.contributions.set(contributor.clone(), so_far + amount);
        campaign.total += amount;
        campaigns.set(campaign_id, campaign);
        save_campaigns(e, &campaigns);
    }

    /// Withdraw the full balance to the owner after the deadline, but only if
    /// the goal was reached. Single-use.
    ///
    /// Authorization: `owner` must authorize.
    pub fn withdraw(e: &Env, campaign_id: u64, owner: Address) {
        owner.require_auth();
        let mut campaigns = load_campaigns(e);
        let mut campaign = campaigns.get(campaign_id).expect("no such campaign");
        if owner != campaign.owner {
            panic!("only the owner can withdraw");
        }
        if e.ledger().timestamp() < campaign.deadline {
            panic!("campaign not ended");
        }
        if campaign.total < campaign.goal {
            panic!("goal not reached");
        }
        if campaign.withdrawn {
            panic!("already withdrawn");
        }
        let contract = e.current_contract_address();
        TokenClient::new(e, &campaign.asset).transfer(&contract, &owner, &campaign.total);
        campaign.withdrawn = true;
        campaigns.set(campaign_id, campaign);
        save_campaigns(e, &campaigns);
    }

    /// Claim a refund of the caller's own contribution after the deadline, but
    /// only if the goal was not reached. Single-use.
    ///
    /// Authorization: `caller` (the contributor) must authorize.
    pub fn claim_refund(e: &Env, campaign_id: u64, contributor: Address) {
        contributor.require_auth();
        let mut campaigns = load_campaigns(e);
        let mut campaign = campaigns.get(campaign_id).expect("no such campaign");
        if e.ledger().timestamp() < campaign.deadline {
            panic!("campaign not ended");
        }
        if campaign.total >= campaign.goal {
            panic!("goal reached, no refunds");
        }
        let amount = campaign.contributions.get(contributor.clone()).unwrap_or(0);
        if amount == 0 {
            panic!("no refund available");
        }
        let contract = e.current_contract_address();
        TokenClient::new(e, &campaign.asset).transfer(&contract, &contributor, &amount);
        campaign.contributions.set(contributor.clone(), 0);
        campaigns.set(campaign_id, campaign);
        save_campaigns(e, &campaigns);
    }

    /// Addresses that have contributed a positive amount to `campaign_id`.
    pub fn contributors(e: &Env, campaign_id: u64) -> Vec<Address> {
        let campaign = load_campaigns(e)
            .get(campaign_id)
            .expect("no such campaign");
        let mut result: Vec<Address> = Vec::new(e);
        for (addr, amount) in campaign.contributions.iter() {
            if amount > 0 {
                result.push_back(addr);
            }
        }
        result
    }

    /// The contribution of `contributor` to `campaign_id` (0 if none).
    pub fn contribution_of(e: &Env, campaign_id: u64, contributor: Address) -> i128 {
        load_campaigns(e)
            .get(campaign_id)
            .expect("no such campaign")
            .contributions
            .get(contributor)
            .unwrap_or(0)
    }

    /// The non-zero contributions to `campaign_id`, keyed by contributor.
    pub fn contributions(e: &Env, campaign_id: u64) -> Map<Address, i128> {
        let campaign = load_campaigns(e)
            .get(campaign_id)
            .expect("no such campaign");
        let mut result: Map<Address, i128> = Map::new(e);
        for (addr, amount) in campaign.contributions.iter() {
            if amount > 0 {
                result.set(addr, amount);
            }
        }
        result
    }

    /// Total amount contributed to `campaign_id`.
    pub fn total_raised(e: &Env, campaign_id: u64) -> i128 {
        load_campaigns(e)
            .get(campaign_id)
            .expect("no such campaign")
            .total
    }

    /// Whether `campaign_id`'s goal has been reached.
    pub fn goal_reached(e: &Env, campaign_id: u64) -> bool {
        let campaign = load_campaigns(e)
            .get(campaign_id)
            .expect("no such campaign");
        campaign.total >= campaign.goal
    }
}

#[cfg(test)]
mod test;
