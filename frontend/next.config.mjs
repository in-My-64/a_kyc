// ~/a_kyc/frontend/next.config.mjs
import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Anchor the workspace root at this directory. Without it, Next walks
  // up and finds the stale ~/a_kyc/package-lock.json, misidentifies the
  // project root, and emits the "multiple lockfiles" warning.
  outputFileTracingRoot: path.join(import.meta.dirname),
};

export default nextConfig;