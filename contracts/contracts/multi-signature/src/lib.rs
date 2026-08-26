#![no_std]

//! Multi-signature is a minimal M-of-N approval component.
//!
//! Three signers are configured at construction together with a threshold.
//! Each signer may approve a proposal (identified by a `Symbol`) once;
//! approvals are idempotent per signer. A proposal may be executed once its
//! distinct approval count reaches the threshold. The component fits the
//! existing generic Component Ecosystem pipeline with no component-specific
//! platform branching.

use soroban_sdk::{contract, contractimpl, Address, Env, Map, Symbol};

#[contract]
pub struct MultiSignature;

#[contractimpl]
impl MultiSignature {
    /// Configures the three authorized signers and the M-of-N threshold.
    /// Constructor auth is mocked at deploy time (like every other component),
    /// so no caller check is needed here.
    pub fn __constructor(
        e: &Env,
        signer1: Address,
        signer2: Address,
        signer3: Address,
        threshold: u32,
    ) {
        let mut signers = Map::new(e);
        signers.set(signer1, true);
        signers.set(signer2, true);
        signers.set(signer3, true);
        e.storage()
            .instance()
            .set(&Symbol::new(e, "signers"), &signers);
        e.storage()
            .instance()
            .set(&Symbol::new(e, "threshold"), &threshold);
        e.storage().instance().set(
            &Symbol::new(e, "approvals"),
            &Map::<Symbol, Map<Address, bool>>::new(e),
        );
        e.storage()
            .instance()
            .set(&Symbol::new(e, "executed"), &Map::<Symbol, bool>::new(e));
    }

    fn signers(e: &Env) -> Map<Address, bool> {
        e.storage()
            .instance()
            .get(&Symbol::new(e, "signers"))
            .unwrap()
    }

    fn threshold(e: &Env) -> u32 {
        e.storage()
            .instance()
            .get(&Symbol::new(e, "threshold"))
            .unwrap()
    }

    fn approvals(e: &Env) -> Map<Symbol, Map<Address, bool>> {
        e.storage()
            .instance()
            .get(&Symbol::new(e, "approvals"))
            .unwrap()
    }

    fn set_approvals(e: &Env, approvals: &Map<Symbol, Map<Address, bool>>) {
        e.storage()
            .instance()
            .set(&Symbol::new(e, "approvals"), approvals);
    }

    fn approval_count(e: &Env, proposal: &Symbol) -> u32 {
        Self::approvals(e)
            .get(proposal.clone())
            .unwrap_or(Map::new(e))
            .len()
    }

    /// Records an approval from `signer` for `proposal_id`. Idempotent per
    /// signer: repeating an approval does not double-count. Only authorized
    /// signers may approve; the invoking account must authorize `signer`.
    pub fn approve(e: &Env, signer: Address, proposal_id: Symbol) {
        signer.require_auth();
        if !Self::signers(e).get(signer.clone()).is_some() {
            panic!("not an authorized signer");
        }
        let mut approvals = Self::approvals(e);
        let mut proposal_approvals =
            approvals.get(proposal_id.clone()).unwrap_or(Map::new(e));
        if proposal_approvals.get(signer.clone()).is_none() {
            proposal_approvals.set(signer, true);
            approvals.set(proposal_id, proposal_approvals);
            Self::set_approvals(e, &approvals);
        }
    }

    /// Returns whether `proposal_id` has reached the approval threshold.
    pub fn is_approved(e: &Env, proposal_id: Symbol) -> bool {
        Self::approval_count(e, &proposal_id) >= Self::threshold(e)
    }

    /// Executes `proposal_id` once its approvals meet the threshold, recording
    /// that it executed. Returns whether execution occurred.
    pub fn execute(e: &Env, proposal_id: Symbol) -> bool {
        let approved = Self::is_approved(e, proposal_id.clone());
        if approved {
            let mut executed = e
                .storage()
                .instance()
                .get(&Symbol::new(e, "executed"))
                .unwrap_or(Map::new(e));
            executed.set(proposal_id, true);
            e.storage()
                .instance()
                .set(&Symbol::new(e, "executed"), &executed);
        }
        approved
    }
}

#[cfg(test)]
mod test;
