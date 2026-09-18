import type { NextConfig } from "next";

const config: NextConfig = {
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  serverExternalPackages: ["@titanexchange/sdk-ts"],
};
export default config;
