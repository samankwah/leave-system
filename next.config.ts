import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs", "pg", "@electric-sql/pglite"],
  // Local production/E2E builds can use their own folder (NEXT_DIST_DIR=.next-build), so they never
  // collide with a running `next dev`, which also writes to .next. Vercel uses the default.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // Import only the MUI components/icons actually used (smaller client bundles, faster compiles).
  experimental: { optimizePackageImports: ["@mui/material", "@mui/icons-material"] },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "same-origin" },
      ],
    }];
  },
};

export default nextConfig;
