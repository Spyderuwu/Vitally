import type { NextConfig } from "next";

// Static export so it can live on GitHub Pages (or Vercel) with no server.
// NEXT_PUBLIC_BASE_PATH is set by the Pages workflow to "/<repo-name>".
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
