import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || `${Date.now()}`;

try {
  const publicDir = path.join(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(publicDir, 'version.json'),
    JSON.stringify({ version: BUILD_ID, timestamp: Date.now() })
  );
} catch {
  // Silent fail if filesystem restricted
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: BUILD_ID,
  },
  generateBuildId: async () => BUILD_ID,
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["pdf-lib", "@aws-sdk/client-s3"],
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  turbopack: {
    resolveAlias: {
      canvas: './src/lib/empty-module.js',
    },
  },
  async headers() {
    return [
      {
        source: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2)$).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

