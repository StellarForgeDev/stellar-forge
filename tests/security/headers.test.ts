import { describe, expect, it } from "vitest";
import { securityHeaders } from "../../next.config";

describe("application security headers", () => {
  const headers = new Map(securityHeaders.map(({ key, value }) => [key, value]));

  it("defines the required response headers", () => {
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("keeps the CSP restricted to the resources the application uses", () => {
    const csp = headers.get("Content-Security-Policy");

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self' https://friendbot.stellar.org");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
});
