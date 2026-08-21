import type { NextConfig } from "next";

const requestedBuildCpus = Number(process.env.NEXT_BUILD_CPUS ?? 20);
const buildCpus = Number.isInteger(requestedBuildCpus)
  ? Math.min(24, Math.max(1, requestedBuildCpus))
  : 20;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  
  // Blocks cross-origin asset/endpoint tampering on your dev domains
  allowedDevOrigins: [
    "psarai.com",
    "*.psarai.com",
    "127.0.0.1",
    "192.168.10.105",
    "192.168.51.100",
    "localhost"
  ],

  experimental: {
    cpus: buildCpus,
    
    // Note: These flags only apply if using the legacy Webpack pipeline (--webpack)
    // Next 16 Turbopack build pipelines isolate execution natively in Rust
    workerThreads: false,
    webpackBuildWorker: true,
    webpackMemoryOptimizations: false,
  },

  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
};

export default nextConfig;
