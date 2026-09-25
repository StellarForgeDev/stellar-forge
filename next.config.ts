import type { NextConfig } from "next";

export const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      process.env.NODE_ENV === "development" ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
      process.env.NODE_ENV === "development" ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
      "font-src 'self'",
      "img-src 'self'",
      "connect-src 'self' https://friendbot.stellar.org",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },

  // The Playground API route spawns the native sandbox-runner and reads
  // contract wasm files through runtime-computed paths, which static file
  // tracing cannot discover. Include every candidate artifact explicitly so
  // the serverless function bundle contains them on Vercel.
  outputFileTracingIncludes: {
    "/api/playground": [
      "./contracts/prebuilt/*.wasm",
      "./contracts/target/release/sandbox-runner",
      "./contracts/target/debug/sandbox-runner",
      "./contracts/target/release/sandbox-runner.exe",
      "./contracts/target/debug/sandbox-runner.exe",
      "./contracts/target/wasm32v1-none/release/*.wasm",
    ],
  },
};

export default nextConfig;
