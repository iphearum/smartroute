import type { NextConfig } from "next";

const requestedBuildCpus = Number(process.env.NEXT_BUILD_CPUS ?? 20);
const buildCpus = Number.isInteger(requestedBuildCpus)
  ? Math.min(24, Math.max(1, requestedBuildCpus))
  : 20;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", 'psarai.com', '192.168.51.100', "localhost", '::1'],
  // Keep four of the host's 24 cores available for the OS and other services.
  // Set NEXT_BUILD_CPUS=1 if a constrained build host needs a safe fallback.
  experimental: {
    cpus: buildCpus,
    workerThreads: true,
    webpackBuildWorker: true,
    webpackMemoryOptimizations: false,
  },
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
};

export default nextConfig;
