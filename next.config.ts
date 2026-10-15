import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the Playwright server run beside a normal `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    // Bookmarks from before applications became Job Drives.
    return [{ source: "/app/applications", destination: "/app/drives", permanent: true }];
  },
};

export default nextConfig;
