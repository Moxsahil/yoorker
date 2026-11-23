import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@yoorker/contracts", "@yoorker/tokens", "@yoorker/ui"],
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
