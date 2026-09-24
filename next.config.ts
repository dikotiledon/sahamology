import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for the Docker runtime stage (server.js bundle).
  output: "standalone",
  // Pin file tracing to this project directory so the standalone bundle does
  // not get nested under a wrong workspace root when a stray parent lockfile
  // exists (Next otherwise warns and re-scopes outputFileTracingRoot).
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
