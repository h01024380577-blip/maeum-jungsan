import type { NextConfig } from 'next';

const isCSR = process.env.NEXT_BUILD_CSR === '1';

const nextConfig: NextConfig = {
  distDir: 'dist',
  images: {
    ...(isCSR ? { unoptimized: true } : {}),
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
    ],
  },
};

export default nextConfig;
