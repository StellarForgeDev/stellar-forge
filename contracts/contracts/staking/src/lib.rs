#![no_std]

//! Staking is a minimal single-asset staking contract.
//!
//! A single SEP-41 `asset` is both the staked token and the rewarded token.
//! Stakers deposit the asset and accrue rewards over time at a fixed rate that an
//! admin funds through `fund_rewards`. Reward accounting follows the standard
//! "reward-per-token" model (a Synthetix-style accrual), so rewards are
//! proportional to each staker's share of the pool and to the time staked.
//!
//! The rate is derived from the funded amount and a fixed `duration` window set
//! at construction; the admin can top up and extend the reward period at any
//! time. Time stays internal contract state (Soroban `Timepoint`s), so no new
//! platform parameter type is required — the component fits the generic catalog
//! → Playground → sandbox → integration pipeline exactly like Vesting.

use soroban_sdk::{
    contract, contractimpl,
    token::TokenClient,
    Address, Env, Map, Symbol, Timepoint,
};

/// Precision multiplier used to keep the fractional reward-per-token rate exact
/// across integer arithmetic. Rewards, stakes, and rates are all expressed in the
/// asset's smallest units (e.g. 1e-7 for a 7-decimal token).
const PRECISION: i128 = 1_000_000_000_000_000_000;

const ASSET: &str = "asset";
const DURATION: &str = "duration";
const REWARD_RATE: &str = "reward_rate";
const PERIOD_FINISH: &str = "period_finish";
const LAST_UPDATE: &str = "last_update";
const TOTAL_STAKED: &str = "total_staked";
const RPT_STORED: &str = "rpt_stored";
const BALANCES: &str = "balances";
const REWARDS: &str = "rewards";
const RPT_PAID: &str = "rpt_paid";

#[contract]
pub struct Staking;

fn sym(e: &Env, name: &str) -> Symbol {
    Symbol::new(e, name)
}

#[contractimpl]
impl Staking {
    /// Configures the staking pool. `duration` is the reward-window length in
    /// seconds; it is reused for every `fund_rewards` call to derive the reward
    /// rate (`rate = funded_amount / duration`). The constructor takes no auth
    /// (deployment is mocked, like every other component).
    ///
    /// Panics if `duration` is zero.
    pub fn __constructor(e: &Env, asset: Address, duration: u32) {
        if duration == 0 {
            panic!("duration must be greater than zero");
        }
        let now = e.ledger().timestamp();
        e.storage().instance().set(&sym(e, ASSET), &asset);
        e.storage().instance().set(&sym(e, DURATION), &duration);
        e.storage().instance().set(&sym(e, REWARD_RATE), &0i128);
        e.storage().instance().set(&sym(e, TOTAL_STAKED), &0i128);
        e.storage().instance().set(&sym(e, RPT_STORED), &0i128);
        e.storage()
            .instance()
            .set(&sym(e, PERIOD_FINISH), &Timepoint::from_unix(e, 0));
        e.storage()
            .instance()
            .set(&sym(e, LAST_UPDATE), &Timepoint::from_unix(e, now));
        e.storage()
            .instance()
            .set(&sym(e, BALANCES), &Map::<Address, i128>::new(e));
        e.storage()
            .instance()
            .set(&sym(e, REWARDS), &Map::<Address, i128>::new(e));
        e.storage()
            .instance()
            .set(&sym(e, RPT_PAID), &Map::<Address, i128>::new(e));
    }

    fn asset(e: &Env) -> Address {
        e.storage().instance().get(&sym(e, ASSET)).unwrap()
    }

    fn duration(e: &Env) -> u32 {
        e.storage().instance().get(&sym(e, DURATION)).unwrap()
    }

    fn read_reward_rate(e: &Env) -> i128 {
        e.storage().instance().get(&sym(e, REWARD_RATE)).unwrap()
    }

    fn set_reward_rate(e: &Env, value: i128) {
        e.storage().instance().set(&sym(e, REWARD_RATE), &value);
    }

    fn period_finish(e: &Env) -> Timepoint {
        e.storage().instance().get(&sym(e, PERIOD_FINISH)).unwrap()
    }

    fn set_period_finish(e: &Env, value: Timepoint) {
        e.storage().instance().set(&sym(e, PERIOD_FINISH), &value);
    }

    fn last_update(e: &Env) -> Timepoint {
        e.storage().instance().get(&sym(e, LAST_UPDATE)).unwrap()
    }

    fn set_last_update(e: &Env, value: Timepoint) {
        e.storage().instance().set(&sym(e, LAST_UPDATE), &value);
    }

    fn read_total_staked(e: &Env) -> i128 {
        e.storage().instance().get(&sym(e, TOTAL_STAKED)).unwrap()
    }

    fn set_total_staked(e: &Env, value: i128) {
        e.storage().instance().set(&sym(e, TOTAL_STAKED), &value);
    }

    fn rpt_stored(e: &Env) -> i128 {
        e.storage().instance().get(&sym(e, RPT_STORED)).unwrap()
    }

    fn set_rpt_stored(e: &Env, value: i128) {
        e.storage().instance().set(&sym(e, RPT_STORED), &value);
    }

    fn balances(e: &Env) -> Map<Address, i128> {
        e.storage()
            .instance()
            .get(&sym(e, BALANCES))
            .unwrap_or_else(|| Map::new(e))
    }

    fn set_balances(e: &Env, value: &Map<Address, i128>) {
        e.storage().instance().set(&sym(e, BALANCES), value);
    }

    fn rewards(e: &Env) -> Map<Address, i128> {
        e.storage()
            .instance()
            .get(&sym(e, REWARDS))
            .unwrap_or_else(|| Map::new(e))
    }

    fn set_rewards(e: &Env, value: &Map<Address, i128>) {
        e.storage().instance().set(&sym(e, REWARDS), value);
    }

    fn rpt_paid(e: &Env) -> Map<Address, i128> {
        e.storage()
            .instance()
            .get(&sym(e, RPT_PAID))
            .unwrap_or_else(|| Map::new(e))
    }

    fn set_rpt_paid(e: &Env, value: &Map<Address, i128>) {
        e.storage().instance().set(&sym(e, RPT_PAID), value);
    }

    /// The latest ledger time at which rewards are still accruing: `now`, capped
    /// at `period_finish`. Once the period ends, no further rewards accrue.
    fn last_time_applicable(e: &Env) -> u64 {
        let now = e.ledger().timestamp();
        let finish = Self::period_finish(e).to_unix();
        if now < finish {
            now
        } else {
            finish
        }
    }

    /// Global reward-per-token rate in `PRECISION`-scaled units: the accumulated
    /// rate plus the accrual since `last_update` over the current total staked.
    fn reward_per_token(e: &Env) -> i128 {
        let total = Self::read_total_staked(e);
        if total == 0 {
            return Self::rpt_stored(e);
        }
        let dt = Self::last_time_applicable(e) as i128 - Self::last_update(e).to_unix() as i128;
        let increment = dt * Self::read_reward_rate(e) * PRECISION / total;
        Self::rpt_stored(e) + increment
    }

    /// Rewards accrued to `user` but not yet claimed: the stored pending amount
    /// plus the share earned since the user's last checkpoint.
    fn accrued(e: &Env, user: &Address) -> i128 {
        let balance = Self::balances(e).get(user.clone()).unwrap_or(0);
        let rpt = Self::reward_per_token(e);
        let paid = Self::rpt_paid(e).get(user.clone()).unwrap_or(0);
        Self::rewards(e).get(user.clone()).unwrap_or(0) + balance * (rpt - paid) / PRECISION
    }

    /// Snapshots global reward state and, for `user`, checkpoints their accrued
    /// rewards and reward-per-token paid. Mirrors the standard per-account update.
    fn update_reward(e: &Env, user: &Address) {
        let rpt = Self::reward_per_token(e);
        Self::set_rpt_stored(e, rpt);
        Self::set_last_update(e, Timepoint::from_unix(e, Self::last_time_applicable(e)));

        let mut rewards = Self::rewards(e);
        rewards.set(user.clone(), Self::accrued(e, user));
        Self::set_rewards(e, &rewards);

        let mut paid = Self::rpt_paid(e);
        paid.set(user.clone(), rpt);
        Self::set_rpt_paid(e, &paid);
    }

    /// Funds the reward pool. The admin transfers `amount` of the asset into the
    /// contract and (re)starts a reward period of `duration` seconds. The new
    /// rate is `amount / duration`; if a period is still active, the leftover
    /// rewards are carried forward so the rate stays continuous. Authorized by
    /// `from` and flagged `admin` in the catalog.
    pub fn fund_rewards(e: &Env, from: Address, amount: i128) {
        if amount <= 0 {
            panic!("fund_rewards amount must be positive");
        }
        from.require_auth();
        // Snapshot global reward state before changing the rate/period.
        Self::update_reward(e, &from);

        let token = TokenClient::new(e, &Self::asset(e));
        token.transfer(&from, &e.current_contract_address(), &amount);

        let now = e.ledger().timestamp();
        let dur = Self::duration(e) as i128;
        let new_rate = if now >= Self::period_finish(e).to_unix() {
            amount / dur
        } else {
            let remaining = (Self::period_finish(e).to_unix() - now) as i128;
            let leftover = remaining * Self::read_reward_rate(e);
            (amount + leftover) / dur
        };
        Self::set_reward_rate(e, new_rate);
        Self::set_period_finish(e, Timepoint::from_unix(e, now + Self::duration(e) as u64));
        // Anchor the accrual window to the funding time so rewards only accrue
        // from here, not from contract deployment.
        Self::set_last_update(e, Timepoint::from_unix(e, now));
    }

    /// Stakes `amount` of the asset from `from`. Authorized by `from`
    /// (`first-address`). Updates the staker's checkpoint, pulls the asset in,
    /// and increases their balance and the pool total.
    pub fn stake(e: &Env, from: Address, amount: i128) {
        if amount <= 0 {
            panic!("stake amount must be positive");
        }
        from.require_auth();
        Self::update_reward(e, &from);

        let token = TokenClient::new(e, &Self::asset(e));
        token.transfer(&from, &e.current_contract_address(), &amount);

        let mut balances = Self::balances(e);
        let new_balance = balances.get(from.clone()).unwrap_or(0) + amount;
        balances.set(from.clone(), new_balance);
        Self::set_balances(e, &balances);
        Self::set_total_staked(e, Self::read_total_staked(e) + amount);
    }

    /// Unstakes up to `amount` of the asset from `from`. Authorized by `from`
    /// (`first-address`). Claims any pending rewards first, then returns the
    /// requested stake (capped at the staker's balance) to `from`.
    pub fn unstake(e: &Env, from: Address, amount: i128) {
        if amount <= 0 {
            panic!("unstake amount must be positive");
        }
        from.require_auth();
        Self::update_reward(e, &from);

        let mut rewards = Self::rewards(e);
        let pending = rewards.get(from.clone()).unwrap_or(0);
        rewards.set(from.clone(), 0);
        Self::set_rewards(e, &rewards);

        if pending > 0 {
            let token = TokenClient::new(e, &Self::asset(e));
            token.transfer(&e.current_contract_address(), &from, &pending);
        }

        let mut balances = Self::balances(e);
        let current = balances.get(from.clone()).unwrap_or(0);
        let out = if amount > current { current } else { amount };
        balances.set(from.clone(), current - out);
        Self::set_balances(e, &balances);
        Self::set_total_staked(e, Self::read_total_staked(e) - out);

        if out > 0 {
            let token = TokenClient::new(e, &Self::asset(e));
            token.transfer(&e.current_contract_address(), &from, &out);
        }
    }

    /// Claims the rewards accrued to `from`. Authorized by `from`
    /// (`first-address`). Returns the amount transferred.
    pub fn claim(e: &Env, from: Address) -> i128 {
        from.require_auth();
        Self::update_reward(e, &from);

        let mut rewards = Self::rewards(e);
        let pending = rewards.get(from.clone()).unwrap_or(0);
        rewards.set(from.clone(), 0);
        Self::set_rewards(e, &rewards);

        if pending > 0 {
            let token = TokenClient::new(e, &Self::asset(e));
            token.transfer(&e.current_contract_address(), &from, &pending);
        }
        pending
    }

    /// Returns the staked balance of `of`. No authorization.
    pub fn staked_balance(e: &Env, of: Address) -> i128 {
        Self::balances(e).get(of).unwrap_or(0)
    }

    /// Returns the rewards accrued to `of` but not yet claimed. No authorization.
    pub fn earned(e: &Env, of: Address) -> i128 {
        Self::accrued(e, &of)
    }

    /// Returns the total amount currently staked in the pool. No authorization.
    pub fn total_staked(e: &Env) -> i128 {
        Self::read_total_staked(e)
    }

    /// Returns the current reward rate (reward tokens per second). No authorization.
    pub fn reward_rate(e: &Env) -> i128 {
        Self::read_reward_rate(e)
    }
}

#[cfg(test)]
mod test;
