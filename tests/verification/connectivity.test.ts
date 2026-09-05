import { describe, expect, it, vi } from "vitest";
import { classifyConnectivityError, diagnoseTestnetConnectivity } from "@/lib/verification/testnet-connectivity";
import { retrieveArtifactWithRetry } from "@/lib/verification/artifact-retrieval";

const healthy = { getHealth: vi.fn().mockResolvedValue({ status: "healthy" }), getNetwork: vi.fn().mockResolvedValue({ passphrase: "Test SDF Network ; September 2015" }) };
const contract = "CB5LA255QBGZH4UURMOGL6SJIVQE5PFQXZZ5JSF7UD5SIYQSGVAM3HQY";

describe("read-only Testnet connectivity", () => {
  it("accepts healthy Soroban RPC and verifies passphrase", async () => { const result = await diagnoseTestnetConnectivity({ client: healthy, observedAt: "1" }); expect(["HEALTHY", "NETWORK_OK"]).toContain(result.status); expect(result.sorobanRpc).toBe("PASS"); });
  it("classifies passphrase and transport failures precisely", async () => { expect((await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockResolvedValue({ status: "healthy" }), getNetwork: vi.fn().mockResolvedValue({ passphrase: "mainnet" }) } })).failureCategory).toBe("PASSPHRASE_MISMATCH"); expect(classifyConnectivityError(new Error("certificate verify failed")).category).toBe("TLS_FAILURE"); expect(classifyConnectivityError(new Error("getaddrinfo ENOTFOUND rpc")).category).toBe("DNS_FAILURE"); expect(classifyConnectivityError(new Error("request timed out")).category).toBe("RPC_TIMEOUT"); });
  it("rejects malformed health responses", async () => { expect((await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockResolvedValue({}), getNetwork: vi.fn() } })).failureCategory).toBe("RPC_MALFORMED_RESPONSE"); });
  it("distinguishes HTTP failure from RPC endpoint unavailable", async () => { expect(classifyConnectivityError(new Error("fetch failed")).category).toBe("HTTP_FAILURE"); expect(classifyConnectivityError(new Error("rpc endpoint unavailable 503")).category).toBe("RPC_ENDPOINT_UNAVAILABLE"); expect(classifyConnectivityError(new Error("method not supported")).category).toBe("RPC_METHOD_UNAVAILABLE"); });
});

describe("bounded artifact retry", () => {
  it("retries finite read-only retrieval and stops on success", async () => { const retrieve = vi.fn().mockRejectedValueOnce(new Error("fetch failed")).mockResolvedValueOnce(new Uint8Array([1, 2, 3])); const result = await retrieveArtifactWithRetry({ source: "rpc", method: "getWasm", retrieve }, contract, { attempts: 3, sleep: async () => undefined }); expect(result.observation.success).toBe(true); expect(retrieve).toHaveBeenCalledTimes(2); });
  it("exhausts bounded retries without submission or fabricated hashes", async () => { const retrieve = vi.fn().mockRejectedValue(new Error("fetch failed")); const result = await retrieveArtifactWithRetry({ source: "rpc", method: "getWasm", retrieve }, contract, { attempts: 2, sleep: async () => undefined }); expect(retrieve).toHaveBeenCalledTimes(2); expect(result.observation.artifactHash).toBeNull(); });
});
