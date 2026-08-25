#![no_std]

//! Access Control is a minimal, role-based authorization component.
//!
//! It stores a single admin and a set of `(role, account)` grants. Only the
//! admin may grant or revoke roles and transfer administration. The component is
//! intentionally small — no role hierarchies, no timelocks, no multisig — so it
//! fits the existing generic Component Ecosystem pipeline without any
//! component-specific platform branching.

use soroban_sdk::{contract, contractimpl, Address, Env, Map, Symbol};

#[contract]
pub struct AccessControl;

#[contractimpl]
impl AccessControl {
    /// Initializes the contract with `admin`. Constructor auth is mocked at
    /// deploy time (like every other component), so no caller check is needed
    /// here.
    pub fn __constructor(e: &Env, admin: Address) {
        e.storage()
            .instance()
            .set(&Symbol::new(e, "admin"), &admin);
        Self::set_roles(e, &Map::new(e));
    }

    fn admin(e: &Env) -> Address {
        e.storage()
            .instance()
            .get(&Symbol::new(e, "admin"))
            .unwrap()
    }

    fn roles(e: &Env) -> Map<(Symbol, Address), bool> {
        e.storage()
            .instance()
            .get(&Symbol::new(e, "roles"))
            .unwrap()
    }

    fn set_roles(e: &Env, roles: &Map<(Symbol, Address), bool>) {
        e.storage().instance().set(&Symbol::new(e, "roles"), roles);
    }

    fn require_admin(e: &Env) {
        Self::admin(e).require_auth();
    }

    /// Grants `role` to `account`. Admin-only.
    pub fn grant_role(e: &Env, role: Symbol, account: Address) {
        Self::require_admin(e);
        let mut roles = Self::roles(e);
        roles.set((role, account), true);
        Self::set_roles(e, &roles);
    }

    /// Revokes `role` from `account`. Admin-only.
    pub fn revoke_role(e: &Env, role: Symbol, account: Address) {
        Self::require_admin(e);
        let mut roles = Self::roles(e);
        roles.remove((role, account));
        Self::set_roles(e, &roles);
    }

    /// Returns whether `account` currently holds `role`. Read-only.
    pub fn has_role(e: &Env, role: Symbol, account: Address) -> bool {
        Self::roles(e).get((role, account)).unwrap_or(false)
    }

    /// Transfers administration to `new_admin`. Admin-only.
    pub fn transfer_admin(e: &Env, new_admin: Address) {
        Self::require_admin(e);
        e.storage()
            .instance()
            .set(&Symbol::new(e, "admin"), &new_admin);
    }
}

#[cfg(test)]
mod test;
