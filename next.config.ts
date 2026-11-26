import type { NextConfig } from "next";
import { developmentOriginRedirects } from "./src/lib/security/development-origin";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  distDir:
    process.env.DELTA_ACCEPTANCE_DIST === "true" ? ".next-acceptance" : ".next",
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  devIndicators: false,
  async redirects() {
    return developmentOriginRedirects(
      process.env.NODE_ENV,
      process.env.APP_ORIGIN,
    );
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'" +
              (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "") +
              "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};
export default config;
