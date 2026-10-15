import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["three"],
  // The HiGHS MIP solver ships as WASM; keep it external and make sure the
  // binary is traced into every route that runs the solver on Vercel.
  serverExternalPackages: ["highs"],
  outputFileTracingIncludes: {
    "/api/night": ["./node_modules/highs/build/highs.wasm"],
    "/api/mcp": ["./node_modules/highs/build/highs.wasm"],
  },
};

export default nextConfig;
