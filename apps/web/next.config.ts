import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;
