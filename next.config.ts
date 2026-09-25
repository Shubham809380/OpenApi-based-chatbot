import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Ensure Turbopack treats this folder as the workspace root.
    root: __dirname,
  },
};

export default nextConfig;
