import type { NextConfig } from 'next';
import { z } from 'zod';
import { securityHeaders } from './src/lib/security-headers';

const apiUrl = z.url({ protocol: /^https?$/ }).safeParse(process.env.API_URL);
if (!apiUrl.success) {
  throw new Error(
    'API_URL must be set to the http(s) base URL of the CartForge API. See apps/web/.env.example.',
  );
}
const apiBaseUrl = apiUrl.data.replace(/\/+$/, '');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The end-to-end suite builds into its own directory, so it can run beside `next dev`.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  headers() {
    return Promise.resolve([
      { source: '/:path*', headers: securityHeaders(process.env.NODE_ENV === 'production') },
    ]);
  },
  // The browser only ever talks to this origin; /api/* is forwarded to the Express API.
  rewrites() {
    return Promise.resolve([{ source: '/api/:path*', destination: `${apiBaseUrl}/api/:path*` }]);
  },
};

export default nextConfig;
