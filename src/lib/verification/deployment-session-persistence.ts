"use client";

import {
  DEPLOYMENT_SESSION_PERSISTENCE_VERSION,
  deserializeDeploymentSession,
  serializeDeploymentSession,
  type DeploymentSession,
} from "./deployment-session";

const STORAGE_KEY = "stellar-forge:deployment-session:v29";

export function saveDeploymentSession(session: DeploymentSession): void {
  try {
    const serialized = serializeDeploymentSession(session);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Fail silently — persistence is best-effort, never throw
  }
}

export function loadDeploymentSession(): DeploymentSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return deserializeDeploymentSession(raw);
  } catch {
    return null;
  }
}

export function clearDeploymentSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function hasPersistedSession(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export { DEPLOYMENT_SESSION_PERSISTENCE_VERSION, STORAGE_KEY };
