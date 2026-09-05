import type { ControlledDeploymentEvidence } from "@/lib/verification/controlled-deployment";

export function ControlledWorkflowPanel({ deployment }: { deployment: Pick<ControlledDeploymentEvidence, "componentId" | "network" | "contractId" | "artifactVerified"> | null }) {
  return <section className="mt-8 rounded-default border border-border bg-surface p-5">
    <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent-stellar">Controlled workflow verification</p>
    {deployment ? <><p className="mt-3 text-sm leading-6 text-text-secondary">Pilot deployment is evidence-backed. Workflow calls target the recorded controlled contract only; the static deployment registry is not used.</p><p className="mt-3 font-mono text-xs text-text-primary">Contract: {deployment.contractId}</p><div className="mt-4 grid gap-3 text-sm text-text-secondary sm:grid-cols-2"><p>Read-only: <code>has_role(role, account)</code> — no signing or submission.</p><p>State-changing: <code>grant_role</code> — explicit confirmation and wallet signing required.</p><p>Confirmation: wait for RPC settlement before reading again.</p><p>Evidence: before/after observations are required before VERIFIED.</p></div></> : <p className="mt-3 text-sm leading-6 text-text-secondary">PILOT UNAVAILABLE: a confirmed controlled deployment with independently verified artifact evidence must be recorded before workflow verification can begin.</p>}
  </section>;
}
