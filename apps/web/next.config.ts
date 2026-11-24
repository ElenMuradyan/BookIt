import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    output: "standalone",
    env: {
      NEXT_PUBLIC_BOOKIT_API_URL: process.env.NEXT_PUBLIC_BOOKIT_API_URL ?? "",
      NEXT_PUBLIC_BOOKIT_USE_MOCKS: process.env.NEXT_PUBLIC_BOOKIT_USE_MOCKS ?? "false",
    },
    transpilePackages: [
      "@bookit/api-client",
      "@bookit/design-system",
      "@bookit/types",
      "@bookit/ui",
      "@bookit/utils",
      "@bookit/validation",
    ],
    images: {
      remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
    },
  };
}
