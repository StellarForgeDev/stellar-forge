#![no_std]

//! Simple Timelock is a minimal conditional-release lock. An owner escrows an
//! asset amount for a beneficiary together with an unlock time (a ledger
//! timestamp in seconds). The asset is pulled into the contract at lock time, so
//! it is genuinely held until release. Release moves the asset to the
//! beneficiary only when the ledger timestamp has reached the unlock time and
//! the beneficiary authorizes the call.

use soroban_sdk::{
    contract, contractimpl, contracttype,
    token::TokenClient,
    Address, Env, Map, Symbol, Timepoint,
};

#[contract]
pub struct Timelock;

#[contractimpl]
impl Timelock {
    /// Stateless init. Timelock stores locks per id, so the constructor takes
    /// no arguments.
    pub fn __constructor(_e: &Env) {}

    /// Escrows `amount` of `asset` for `beneficiary`, released no earlier than
    /// `unlock_time` (a ledger timestamp in seconds). The asset is pulled into
    /// the contract immediately. Returns the new lock id. Authorized by
    /// `owner`.
    pub fn lock(
        e: &Env,
        owner: Address,
        asset: Address,
        amount: i128,
        beneficiary: Address,
        unlock_time: Timepoint,
    ) -> u64 {
        owner.require_auth();
        let contract = e.current_contract_address();
        TokenClient::new(e, &asset).transfer(&owner, &contract, &amount);
        let id = next_id(e);
        let lock = Lock {
            owner,
            asset,
            amount,
            beneficiary,
            unlock_time,
            released: false,
        };
        set_lock(e, id, &lock);
        id
    }

    /// Release `lock_id` to its beneficiary. Fails unless the ledger timestamp
    /// has reached `unlock_time` and the beneficiary authorizes the call. After
    /// release the lock is marked spent and cannot be released again.
    ///
    /// Authorization: `beneficiary` must authorize.
    pub fn release(e: &Env, lock_id: u64) {
        let mut lock = get_lock(e, lock_id);
        if lock.released {
            panic!("lock already released");
        }
        if e.ledger().timestamp() < lock.unlock_time.to_unix() {
            panic!("timelock not yet unlocked");
        }
        lock.beneficiary.require_auth();
        let contract = e.current_contract_address();
        TokenClient::new(e, &lock.asset).transfer(&contract, &lock.beneficiary, &lock.amount);
        lock.released = true;
        set_lock(e, lock_id, &lock);
    }

    /// The ledger timestamp at or after which `lock_id` may be released.
    pub fn unlock_time(e: &Env, lock_id: u64) -> Timepoint {
        get_lock(e, lock_id).unlock_time
    }

    /// Whether `lock_id`'s unlock time has been reached (ledger timestamp >=
    /// `unlock_time`).
    pub fn is_unlocked(e: &Env, lock_id: u64) -> bool {
        let lock = get_lock(e, lock_id);
        e.ledger().timestamp() >= lock.unlock_time.to_unix()
    }

    /// Whether `lock_id` has already been released.
    pub fn lock_released(e: &Env, lock_id: u64) -> bool {
        get_lock(e, lock_id).released
    }
}

#[derive(Clone)]
#[contracttype]
pub struct Lock {
    pub owner: Address,
    pub asset: Address,
    pub amount: i128,
    pub beneficiary: Address,
    pub unlock_time: Timepoint,
    pub released: bool,
}

const LOCKS: &str = "locks";
const NEXT_ID: &str = "next_id";

fn next_id(e: &Env) -> u64 {
    let id: u64 = e.storage().instance().get(&Symbol::new(e, NEXT_ID)).unwrap_or(0);
    e.storage()
        .instance()
        .set(&Symbol::new(e, NEXT_ID), &(id + 1));
    id
}

fn get_lock(e: &Env, id: u64) -> Lock {
    let locks: Map<u64, Lock> = e
        .storage()
        .instance()
        .get(&Symbol::new(e, LOCKS))
        .unwrap_or(Map::new(e));
    locks.get(id).expect("no such lock")
}

fn set_lock(e: &Env, id: u64, lock: &Lock) {
    let mut locks: Map<u64, Lock> = e
        .storage()
        .instance()
        .get(&Symbol::new(e, LOCKS))
        .unwrap_or(Map::new(e));
    locks.set(id, lock.clone());
    e.storage().instance().set(&Symbol::new(e, LOCKS), &locks);
}
