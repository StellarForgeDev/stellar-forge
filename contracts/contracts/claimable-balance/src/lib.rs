#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Duration, Env, Map, Symbol, Timepoint,
};
use soroban_sdk::token::TokenClient;

const ADMIN_KEY: &str = "admin";
const ASSET_KEY: &str = "asset";
const BALANCES_KEY: &str = "balances";
const NEXT_ID_KEY: &str = "next_id";

fn admin_key(e: &Env) -> Symbol {
    Symbol::new(e, ADMIN_KEY)
}
fn asset_key(e: &Env) -> Symbol {
    Symbol::new(e, ASSET_KEY)
}
fn balances_key(e: &Env) -> Symbol {
    Symbol::new(e, BALANCES_KEY)
}
fn next_id_key(e: &Env) -> Symbol {
    Symbol::new(e, NEXT_ID_KEY)
}

const SAFE_ALLOWANCE_TTL: u32 = 1_000_000;

fn check_expiration(e: &Env, expiration_ledger: u32) {
    let current = e.ledger().sequence();
    if expiration_ledger <= current {
        panic!("expiration_ledger must be in the future");
    }
    if expiration_ledger.saturating_sub(current) > SAFE_ALLOWANCE_TTL {
        panic!("expiration_ledger too far");
    }
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Balance {
    pub funder: Address,
    pub claimant: Address,
    pub amount: i128,
    pub unlock_time: u64,
    pub expiry: Option<Timepoint>,
    pub claimed: bool,
    pub cancelled: bool,
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
fn load_balances(e: &Env) -> Map<u64, Balance> {
    e.storage()
        .instance()
        .get(&balances_key(e))
        .unwrap_or(Map::new(e))
}
fn save_balances(e: &Env, balances: &Map<u64, Balance>) {
    e.storage().instance().set(&balances_key(e), balances);
}
fn next_id(e: &Env) -> u64 {
    e.storage()
        .instance()
        .get(&next_id_key(e))
        .unwrap_or(0u64)
}
fn bump_next_id(e: &Env, id: u64) {
    e.storage().instance().set(&next_id_key(e), &id);
}

#[contract]
pub struct ClaimableBalance;

#[contractimpl]
impl ClaimableBalance {
    pub fn __constructor(e: &Env, admin: Address, asset: Address) {
        e.storage().instance().set(&admin_key(e), &admin);
        e.storage().instance().set(&asset_key(e), &asset);
    }

    pub fn deposit(
        e: &Env,
        funder: Address,
        claimant: Address,
        amount: i128,
        delay: Duration,
        expiry: Option<Timepoint>,
        expiration_ledger: u32,
    ) -> u64 {
        if amount <= 0 {
            panic!("amount must be positive");
        }
        check_expiration(e, expiration_ledger);
        funder.require_auth();

        let asset = load_asset(e);
        let contract = e.current_contract_address();
        let unlock_time = e.ledger().timestamp().saturating_add(delay.to_seconds());

        let token = TokenClient::new(e, &asset);
        token.approve(&funder, &contract, &amount, &expiration_ledger);
        token.transfer_from(&contract, &funder, &contract, &amount);

        let mut balances = load_balances(e);
        let id = next_id(e);
        balances.set(
            id,
            Balance {
                funder,
                claimant,
                amount,
                unlock_time,
                expiry,
                claimed: false,
                cancelled: false,
            },
        );
        save_balances(e, &balances);
        bump_next_id(e, id.saturating_add(1));
        id
    }

    pub fn claim(e: &Env, balance_id: u64) {
        let mut balances = load_balances(e);
        let mut b = balances.get(balance_id).expect("no such balance");
        if b.claimed {
            panic!("balance already claimed");
        }
        if b.cancelled {
            panic!("balance cancelled");
        }
        let now = e.ledger().timestamp();
        if now < b.unlock_time {
            panic!("balance is not yet unlocked");
        }
        if let Some(exp) = b.expiry.as_ref() {
            if now > exp.to_unix() {
                panic!("balance expired");
            }
        }
        b.claimant.require_auth();

        let asset = load_asset(e);
        let contract = e.current_contract_address();
        TokenClient::new(e, &asset).transfer(&contract, &b.claimant, &b.amount);

        b.claimed = true;
        balances.set(balance_id, b);
        save_balances(e, &balances);
    }

    pub fn cancel(e: &Env, balance_id: u64) {
        load_admin(e).require_auth();

        let mut balances = load_balances(e);
        let mut b = balances.get(balance_id).expect("no such balance");
        if b.cancelled {
            panic!("balance already cancelled");
        }
        if b.claimed {
            panic!("balance already claimed");
        }

        let asset = load_asset(e);
        let contract = e.current_contract_address();
        TokenClient::new(e, &asset).transfer(&contract, &b.funder, &b.amount);

        b.cancelled = true;
        balances.set(balance_id, b);
        save_balances(e, &balances);
    }

    pub fn balance_of(e: &Env, balance_id: u64) -> i128 {
        let b = load_balances(e).get(balance_id).expect("no such balance");
        if b.claimed || b.cancelled {
            0
        } else {
            b.amount
        }
    }

    pub fn is_claimable(e: &Env, balance_id: u64) -> bool {
        let b = load_balances(e).get(balance_id).expect("no such balance");
        if b.claimed || b.cancelled {
            return false;
        }
        let now = e.ledger().timestamp();
        if now < b.unlock_time {
            return false;
        }
        if let Some(exp) = b.expiry.as_ref() {
            if now > exp.to_unix() {
                return false;
            }
        }
        true
    }

    pub fn expiry(e: &Env, balance_id: u64) -> Option<Timepoint> {
        load_balances(e)
            .get(balance_id)
            .expect("no such balance")
            .expiry
    }
}

#[cfg(test)]
mod test;
