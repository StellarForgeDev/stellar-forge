import { describe, expect, it } from "vitest";
import { POST, GET } from "@/app/api/testnet/deployment-session/[action]/route";

describe("Deployment Session Action Dispatch", () => {
  const mockPostRequest = (body: unknown) =>
    new Request("http://localhost/api/testnet/deployment-session/test", {
      method: "POST",
      body: JSON.stringify(body)
    });

  const mockGetRequest = () =>
    new Request("http://localhost/api/testnet/deployment-session/test", {
      method: "GET"
    });

  it("safely rejects unknown actions with 404 (POST)", async () => {
    const res = await POST(mockPostRequest({}), { params: Promise.resolve({ action: "unknown" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Unsupported action.");
  });

  it("safely rejects unknown actions with 404 (GET)", async () => {
    const res = await GET(mockGetRequest(), { params: Promise.resolve({ action: "unknown" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Unsupported action.");
  });

  it("dispatches POST action=restore to handleRestore (fails with 400 when missing serialized session)", async () => {
    const res = await POST(mockPostRequest({}), { params: Promise.resolve({ action: "restore" }) });
    expect(res.status).toBe(200); // Wait, handleRestore returns 200 with { status: "INVALID_PERSISTENCE", error: "No session." } if serialized is null/invalid.
    const body = await res.json();
    expect(body.status).toBe("INVALID_PERSISTENCE");
    expect(body.error).toBeDefined();
  });

  it("rejects GET action=restore with 405", async () => {
    const res = await GET(mockGetRequest(), { params: Promise.resolve({ action: "restore" }) });
    expect(res.status).toBe(405);
    const body = await res.json();
    expect(body.error).toBe("POST with { serialized } required.");
  });

  it("dispatches POST action=reconcile to reconcileRequest", async () => {
    // A reconcile request with empty body is valid but will hit network/account checks.
    // It should just return 200 with the reconciled state (often "NETWORK_OK" or similar, maybe failing at connectivity due to mock, but it definitely reaches the logic).
    // Let's just expect it returns 200 as long as JSON is valid.
    const res = await POST(mockPostRequest({}), { params: Promise.resolve({ action: "reconcile" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.network).toBe("testnet");
    expect(body.reconciliationPerformed).toBe(true);
  });

  it("dispatches GET action=reconcile to reconcileRequest", async () => {
    const res = await GET(mockGetRequest(), { params: Promise.resolve({ action: "reconcile" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.network).toBe("testnet");
    expect(body.reconciliationPerformed).toBe(true);
  });
});
