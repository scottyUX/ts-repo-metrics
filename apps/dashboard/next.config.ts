import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tree-sitter", "tree-sitter-typescript"],
};

export default nextConfig;
