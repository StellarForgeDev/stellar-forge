import { describe, expect, it } from "vitest";
import { evidencePersistenceMode } from "@/lib/verification/evidence-persistence";

describe("repository-authoritative evidence boundary", () => {
  it("blocks durable claims on Vercel even if an opt-in is present", () => {
    expect(evidencePersistenceMode({ vercel: "1", nodeEnv: "production", localRepositoryRecording: "1" })).toBe("runtime-non-durable");
  });

  it("blocks production runtime filesystem persistence by default", () => {
    expect(evidencePersistenceMode({ nodeEnv: "production" })).toBe("runtime-non-durable");
  });

  it("allows explicitly scoped local maintainer recording", () => {
    expect(evidencePersistenceMode({ nodeEnv: "production", localRepositoryRecording: "1" })).toBe("local-repository");
  });

  it("keeps development recording repository-local, never cloud-durable", () => {
    expect(evidencePersistenceMode({ nodeEnv: "development" })).toBe("local-repository");
  });
});
