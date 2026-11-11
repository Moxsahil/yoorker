import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@yoorker/contracts", "@yoorker/tokens", "@yoorker/ui"],
  eslint: { ignoreDuringBuilds: true }, // lint runs as its own turbo task
};
export default nextConfig;
