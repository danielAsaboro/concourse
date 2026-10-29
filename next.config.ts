import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["three"],
  // No dev-only badge over the sidebar while demoing from `npm run dev`, and no generated AGENTS.md.
  devIndicators: false,
  agentRules: false,
  // The HiGHS MIP solver ships as WASM; keep it external and make sure the
  // binary is traced into every route that runs the solver on Vercel.
  serverExternalPackages: ["highs"],
  outputFileTracingIncludes: {
    "/api/night": ["./node_modules/highs/build/highs.wasm"],
    "/api/mcp": ["./node_modules/highs/build/highs.wasm"],
    "/api/ops": ["./node_modules/highs/build/highs.wasm"],
  },
};

export default nextConfig;
