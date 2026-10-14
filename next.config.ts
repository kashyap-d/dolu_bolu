import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    // Bookmarks from before applications became Job Drives.
    return [{ source: "/app/applications", destination: "/app/drives", permanent: true }];
  },
};

export default nextConfig;
