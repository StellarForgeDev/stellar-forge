import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/transactions/deploy/[action]/route";

describe("Dynamic Deploy Action Dispatch", () => {
  const mockRequest = (body: unknown) =>
    new Request("http://localhost/api/transactions/deploy/test", {
      method: "POST",
      body: JSON.stringify(body)
    });

  it("safely rejects unsupported actions", async () => {
    const res = await POST(mockRequest({}), { params: Promise.resolve({ action: "unsupported" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Unsupported action.");
  });

  it("dispatches to prepare logic (fails with prepare-specific error for empty body)", async () => {
    // prepare requires 'network', 'component', 'sourceAccount' etc.
    // Sending an empty body object should trigger prepare's specific 400 validation error
    const res = await POST(mockRequest({}), { params: Promise.resolve({ action: "prepare" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Only the explicit Access Control Testnet pilot is supported.");
  });

  it("dispatches to verify logic (fails with verify-specific error for missing contractId)", async () => {
    const res = await POST(mockRequest({}), { params: Promise.resolve({ action: "verify" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("A valid contract ID is required.");
  });

  it("dispatches to record logic (fails with record-specific error for missing contractId/metadata)", async () => {
    const res = await POST(mockRequest({}), { params: Promise.resolve({ action: "record" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Only confirmed Access Control Testnet deployments with public account metadata can be recorded.");
  });
});
