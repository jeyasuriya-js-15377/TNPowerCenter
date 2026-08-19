/**
 * Catalyst Slate serves static files only, so this app is exported as a fully
 * static bundle: no SSR, no API routes, no server runtime. The backend stays
 * the Catalyst Advanced I/O function at /server/tnpc_api.
 *
 * Slate serves the client under a path prefix (typically /app), so asset URLs
 * must be prefixed to match. Set it at build time:
 *
 *   NEXT_PUBLIC_BASE_PATH=/app npm run build
 *
 * If your Slate URL serves index.html from the domain root instead, build with
 * no base path at all and everything still resolves.
 */

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: basePath || undefined,

  // With no explicit base path, emit RELATIVE asset URLs ('./_next/…') so the
  // export runs unchanged whether Slate serves it from the domain root or from
  // a prefix like /app. This app is a single route with no client-side page
  // navigation, which is what makes relative assets safe here.
  assetPrefix: basePath || './',

  trailingSlash: true,

  // No Next.js image optimiser exists in a static export.
  images: { unoptimized: true },

  // Lint failures should not block a deadline build. Type checking is not in
  // play here — this is a plain JavaScript project by design.
  eslint: { ignoreDuringBuilds: true },

  reactStrictMode: true,
};

export default nextConfig;
