import { beforeEach, describe, expect, it, vi } from "vitest";

type RunnerCallback = (error: Error | null, stdout: string) => void;

const harness = vi.hoisted(() => ({
  execFile: vi.fn(),
  resolveRunner: vi.fn(() => ({ path: "/runner", source: "local-build" })),
  resolveWasm: vi.fn((component: { slug: string }) => ({
    path: `/artifact/${component.slug}.wasm`,
    source: "prebuilt",
  })),
  pending: [] as RunnerCallback[],
}));

vi.mock("node:child_process", () => ({ execFile: harness.execFile }));
vi.mock("@/lib/playground/artifacts", () => ({
  resolveRunner: harness.resolveRunner,
  resolveWasm: harness.resolveWasm,
}));

import { POST } from "@/app/api/playground/route";

const successResponse = JSON.stringify({
  ok: true,
  deployedContract: "CDEMO",
  calls: [{ fn: "has_role", ok: true, result: false }],
});

function payload(overrides: Record<string, unknown> = {}) {
  return {
    componentSlug: "access-control",
    constructor: { admin: "admin" },
    calls: [{ fn: "has_role", args: ["minter", "user1"] }],
    ...overrides,
  };
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/playground", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function completeNextRunner(
  stdout: string,
  error: Error | null = null,
) {
  const callback = harness.pending.shift();
  expect(callback).toBeDefined();
  callback?.(error, stdout);
}

async function flushRouteProgress() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("POST /api/playground", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.pending.length = 0;
    harness.resolveRunner.mockReturnValue({
      path: "/runner",
      source: "local-build",
    });
    harness.resolveWasm.mockImplementation((component: { slug: string }) => ({
      path: `/artifact/${component.slug}.wasm`,
      source: "prebuilt",
    }));
    harness.execFile.mockImplementation((...args: unknown[]) => {
      harness.pending.push(args[3] as RunnerCallback);
      return { stdin: { end: vi.fn() } };
    });
  });

  describe("request parsing and validation", () => {
    it.each([
      ["empty body", "", "request body must be a JSON object"],
      ["invalid JSON", "{", "request body is not valid JSON"],
      ["JSON array", "[]", "request body must be a JSON object"],
      ["JSON primitive", "null", "request body must be a JSON object"],
    ])("rejects %s", async (_label, body, message) => {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        ok: false,
        error: { kind: "input", message },
      });
      expect(harness.execFile).not.toHaveBeenCalled();
    });

    it("rejects a UTF-8 body larger than the request limit", async () => {
      const response = await POST(request(`"${"é".repeat(40_000)}"`));
      expect(response.status).toBe(413);
      expect((await response.json()).error.message).toContain("65536");
      expect(harness.execFile).not.toHaveBeenCalled();
    });

    it("rejects an unknown component slug", async () => {
      const response = await POST(request(payload({ componentSlug: "missing" })));
      expect(response.status).toBe(400);
      expect((await response.json()).error.message).toContain("unknown component");
      expect(harness.execFile).not.toHaveBeenCalled();
    });

    it("rejects an invalid method and parameter value", async () => {
      const invalidMethod = await POST(
        request(payload({ calls: [{ fn: "not_a_method", args: [] }] })),
      );
      expect(invalidMethod.status).toBe(400);

      const invalidValue = await POST(
        request(payload({ calls: [{ fn: "has_role", args: ["minter", "not-an-address"] }] })),
      );
      expect(invalidValue.status).toBe(400);
      expect(harness.execFile).not.toHaveBeenCalled();
    });

    it("rejects invalid identities, too many calls, and too many identities", async () => {
      const invalidIdentity = await POST(
        request(payload({ identities: { user: `G${"A".repeat(55)}` } })),
      );
      expect(invalidIdentity.status).toBe(400);

      const tooManyCalls = await POST(
        request(
          payload({
            calls: Array.from({ length: 21 }, () => ({
              fn: "has_role",
              args: ["minter", "user1"],
            })),
          }),
        ),
      );
      expect(tooManyCalls.status).toBe(400);

      const tooManyIdentities = Object.fromEntries(
        Array.from({ length: 21 }, (_, index) => [
          `user${index}`,
          "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2KM",
        ]),
      );
      const identityLimit = await POST(
        request(payload({ identities: tooManyIdentities })),
      );
      expect(identityLimit.status).toBe(400);
      expect(harness.execFile).not.toHaveBeenCalled();
    });

    it("rejects numeric values outside the declared boundary", async () => {
      const response = await POST(
        request({
          componentSlug: "token",
          constructor: {
            admin: "admin",
            decimal: Number.MAX_SAFE_INTEGER + 1,
            name: "Demo",
            symbol: "D",
          },
          calls: [],
        }),
      );
      expect(response.status).toBe(400);
      expect(harness.execFile).not.toHaveBeenCalled();
    });

    it("rejects caller-controlled WASM paths before execution", async () => {
      const response = await POST(request(payload({ wasmPath: "../../evil.wasm" })));
      expect(response.status).toBe(400);
      expect((await response.json()).error.message).toContain("wasmPath");
      expect(harness.execFile).not.toHaveBeenCalled();
    });
  });

  it("returns a safe response when the expected artifact is missing", async () => {
    harness.resolveWasm.mockReturnValue(null as never);
    const response = await POST(request(payload()));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.message).toContain('component "access-control"');
    expect(body.error.message).not.toContain("/artifact/");
    expect(body.error.message).not.toContain("C:\\");
    expect(harness.execFile).not.toHaveBeenCalled();
  });

  it("maps a successful runner response through the HTTP boundary", async () => {
    const responsePromise = POST(request(payload()));
    await flushRouteProgress();
    expect(harness.execFile).toHaveBeenCalledTimes(1);
    completeNextRunner(successResponse);

    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(JSON.parse(successResponse));
    expect(harness.resolveWasm).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "access-control" }),
    );
  });

  describe("runner failures", () => {
    it("redacts diagnostics from a non-zero runner exit", async () => {
      const responsePromise = POST(request(payload()));
      await flushRouteProgress();
      completeNextRunner(
        JSON.stringify({
          ok: false,
          error: {
            message: "failed to read C:\\private\\secret.wasm",
            path: "/srv/runner",
          },
        }),
        Object.assign(new Error("runner failed"), { code: 7 }),
      );

      const response = await responsePromise;
      const body = await response.json();
      expect(response.status).toBe(502);
      expect(body.error.message).toBe(
        "sandbox execution failed; check the request and try again",
      );
      expect(JSON.stringify(body)).not.toContain("secret.wasm");
      expect(JSON.stringify(body)).not.toContain("/srv/runner");
    });

    it("returns a stable error for empty or invalid runner output", async () => {
      const responsePromise = POST(request(payload()));
      await flushRouteProgress();
      completeNextRunner("raw host diagnostics at C:\\private\\runner");

      const response = await responsePromise;
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        ok: false,
        error: {
          kind: "runner",
          message: "sandbox execution returned an invalid result",
        },
      });
    });

    it("returns safe timeout information without exposing runner details", async () => {
      const responsePromise = POST(request(payload()));
      await flushRouteProgress();
      completeNextRunner(
        "",
        Object.assign(new Error("timed out at C:\\private\\runner"), {
          killed: true,
          code: "ETIMEDOUT",
        }),
      );

      const response = await responsePromise;
      const body = await response.json();
      expect(response.status).toBe(504);
      expect(body.error.message).toBe("sandbox-runner timed out after 10s");
      expect(JSON.stringify(body)).not.toContain("private");
    });
  });

  it("rejects admission when both execution slots are occupied and releases capacity after failure", async () => {
    const first = POST(request(payload()));
    const second = POST(request(payload()));
    await flushRouteProgress();
    expect(harness.execFile).toHaveBeenCalledTimes(2);

    const rejected = await POST(request(payload()));
    expect(rejected.status).toBe(429);
    expect(harness.execFile).toHaveBeenCalledTimes(2);

    completeNextRunner("", Object.assign(new Error("failed"), { code: 1 }));
    completeNextRunner(successResponse);
    await Promise.all([first, second]);

    const admitted = POST(request(payload()));
    await flushRouteProgress();
    expect(harness.execFile).toHaveBeenCalledTimes(3);
    completeNextRunner(successResponse);
    expect((await admitted).status).toBe(200);
  });
});
