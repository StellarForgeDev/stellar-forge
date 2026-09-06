export type EvidencePersistenceMode = "local-repository" | "runtime-non-durable";

/**
 * Repository evidence is durable only after a maintainer commits it. Vercel
 * and production runtimes must never present their application filesystem as
 * a shared evidence store. An explicit local opt-in keeps maintainer scripts
 * usable when NODE_ENV is production.
 */
export function evidencePersistenceMode(env: {
  vercel?: string;
  nodeEnv?: string;
  localRepositoryRecording?: string;
} = {
  vercel: process.env.VERCEL,
  nodeEnv: process.env.NODE_ENV,
  localRepositoryRecording: process.env.STELLAR_FORGE_REPOSITORY_RECORDING,
}): EvidencePersistenceMode {
  if (env.vercel === "1") return "runtime-non-durable";
  if (env.nodeEnv === "production" && env.localRepositoryRecording !== "1") return "runtime-non-durable";
  return "local-repository";
}
