import type { NextConfig } from 'next';
import { z } from 'zod';

const apiUrl = z.url({ protocol: /^https?$/ }).safeParse(process.env.API_URL);
if (!apiUrl.success) {
  throw new Error(
    'API_URL must be set to the http(s) base URL of the CartForge API. See apps/web/.env.example.',
  );
}
const apiBaseUrl = apiUrl.data.replace(/\/+$/, '');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The browser only ever talks to this origin; /api/* is forwarded to the Express API.
  rewrites() {
    return Promise.resolve([{ source: '/api/:path*', destination: `${apiBaseUrl}/api/:path*` }]);
  },
};

export default nextConfig;
