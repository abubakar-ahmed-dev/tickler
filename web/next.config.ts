import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // native/CJS server-only deps must stay external to the bundler
  serverExternalPackages: ["falkordb", "pdfjs-dist", "@temporalio/client"],
};

export default nextConfig;
