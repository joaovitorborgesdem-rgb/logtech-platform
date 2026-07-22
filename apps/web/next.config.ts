import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo: sem isso o tracing usaria apps/web como raiz e perderia
  // arquivos resolvidos via pnpm workspace (ver docs/output.md, seção Caveats).
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
