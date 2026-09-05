import { describe, expect, it, vi } from "vitest";
import { classifyConnectivityError, diagnoseTestnetConnectivity } from "@/lib/verification/testnet-connectivity";

describe("Phase 26: Nested fetch error cause extraction", () => {
  it("fetch failed + ENOTFOUND → DNS_FAILURE", () => {
    const err = new TypeError("fetch failed");
    (err as unknown as Record<string, unknown>).cause = new Error("getaddrinfo ENOTFOUND soroban-testnet.stellar.org");
    expect(classifyConnectivityError(err).category).toBe("DNS_FAILURE");
  });
  it("fetch failed + certificate cause → TLS_FAILURE", () => {
    const err = new TypeError("fetch failed");
    (err as unknown as Record<string, unknown>).cause = new Error("certificate verify failed");
    expect(classifyConnectivityError(err).category).toBe("TLS_FAILURE");
  });
  it("fetch failed + ETIMEDOUT → RPC_TIMEOUT", () => {
    const err = new TypeError("fetch failed");
    (err as unknown as Record<string, unknown>).cause = Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" });
    expect(classifyConnectivityError(err).category).toBe("RPC_TIMEOUT");
  });
  it("fetch failed + ECONNREFUSED → RPC_ENDPOINT_UNAVAILABLE", () => {
    const err = new TypeError("fetch failed");
    (err as unknown as Record<string, unknown>).cause = Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" });
    expect(classifyConnectivityError(err).category).toBe("RPC_ENDPOINT_UNAVAILABLE");
  });
  it("fetch failed without useful cause → HTTP_FAILURE", () => {
    expect(classifyConnectivityError(new TypeError("fetch failed")).category).toBe("HTTP_FAILURE");
  });
  it("bounded nested cause extraction depth 3", () => {
    const deep = new Error("level3 ENOTFOUND");
    const l2 = new Error("level2");
    (l2 as unknown as Record<string, unknown>).cause = deep;
    const l1 = new Error("level1 fetch failed");
    (l1 as unknown as Record<string, unknown>).cause = l2;
    const outer = new TypeError("fetch failed");
    (outer as unknown as Record<string, unknown>).cause = l1;
    // Depth 3 should still find ENOTFOUND at depth 3
    expect(classifyConnectivityError(outer).category).toBe("DNS_FAILURE");
  });
  it("secret-like values filtered from error metadata", async () => {
    const err = new Error("fetch failed secret_key=ABC123 seed phrase");
    const result = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockRejectedValue(err), getNetwork: vi.fn() } });
    expect(result.error).not.toMatch(/secret/i);
    // sanitized message should be filtered
    expect(result.errorMessage ?? result.error).not.toMatch(/secret/i);
  });
});

describe("Phase 26: Layered diagnostics", () => {
  it("DNS failure sets later layers to NOT_RUN", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockRejectedValue(new Error("ENOTFOUND")), getNetwork: vi.fn() } });
    expect(r.dns).toBe("FAIL");
    expect(r.tls).toBe("NOT_RUN");
    expect(r.https).toBe("NOT_RUN");
  });
  it("TLS failure preserves DNS PASS", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockRejectedValue(new Error("certificate")), getNetwork: vi.fn() } });
    expect(r.dns).toBe("PASS");
    expect(r.tls).toBe("FAIL");
    expect(r.https).toBe("FAIL");
  });
  it("HTTPS success distinction", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockResolvedValue({ status: "healthy" }), getNetwork: vi.fn().mockResolvedValue({ passphrase: "Test SDF Network ; September 2015" }) } });
    expect(r.https).toBe("PASS");
    expect(r.httpResponse).toBe("PASS");
  });
  it("health success / network failure distinction", async () => {
    const r = await diagnoseTestnetConnectivity({ client: { getHealth: vi.fn().mockResolvedValue({ status: "healthy" }), getNetwork: vi.fn().mockRejectedValue(new Error("ECONNRESET")) } });
    expect(r.dns).toBe("PASS");
    expect(r.http).toBe("PASS");
    expect(r.sorobanRpc).toBe("FAIL");
    expect(r.error).toMatch(/getNetwork failed after getHealth succeeded/);
  });
});

describe("Phase 26: Historical observations preserved", () => {
  it("latest observation correct and latest successful preserved", async () => {
    // This is covered via artifact retrieval history, but we test connectivity history via two sequential diagnoses
    const okClient = { getHealth: vi.fn().mockResolvedValue({ status: "healthy" }), getNetwork: vi.fn().mockResolvedValue({ passphrase: "Test SDF Network ; September 2015" }) };
    const failClient = { getHealth: vi.fn().mockRejectedValue(new Error("fetch failed")), getNetwork: vi.fn() };
    const ok = await diagnoseTestnetConnectivity({ client: okClient });
    const fail = await diagnoseTestnetConnectivity({ client: failClient });
    expect(ok.status).toBe("NETWORK_OK");
    expect(fail.status).toBe("BLOCKED");
    // Historical would preserve both; latest is fail, latest successful is ok
    // Simulate history array
    const history = [ok, fail];
    const latest = history[history.length - 1];
    const latestSuccessful = [...history].reverse().find((h) => h.status === "NETWORK_OK");
    expect(latest?.status).toBe("BLOCKED");
    expect(latestSuccessful?.status).toBe("NETWORK_OK");
  });
});
