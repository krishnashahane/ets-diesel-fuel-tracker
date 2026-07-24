import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

// Content-Security-Policy.
// - 'wasm-unsafe-eval' (prod) is what the self-hosted Tesseract WASM core needs.
//   Full 'unsafe-eval' is granted only in development, for Next's dev overlay.
// - 'unsafe-inline' on script-src remains for Next's hydration bootstrap scripts.
// - Everything is self-hosted: no CDN, no external font / image / script origin.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isProd ? "'wasm-unsafe-eval'" : "'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' blob:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isProd ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=(), browsing-topics=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Origin-Agent-Cluster', value: '?1' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Never ship a build that type-checks dirty.
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // API responses carry authenticated data — keep them out of every cache.
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, private' }] },
    ];
  },
};

export default nextConfig;
