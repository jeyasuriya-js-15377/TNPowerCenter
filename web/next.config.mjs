/**
 * Two supported hosting modes.
 *
 * 1. Next.js (default)
 *    The host builds and runs the app server-side. Server routes work, so
 *    app/api/[...path]/route.js can proxy the API function and the browser
 *    only ever talks to its own origin.
 *
 * 2. Static export      NEXT_STATIC_EXPORT=true
 *    Produces plain files in out/. No server, so the proxy route does not exist
 *    and the client must be built with an absolute NEXT_PUBLIC_API_BASE.
 */

const staticExport = process.env.NEXT_STATIC_EXPORT === 'true';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(staticExport ? { output: 'export' } : {}),
  basePath: basePath || undefined,
  ...(staticExport ? { assetPrefix: basePath || './' } : {}),
  trailingSlash: staticExport,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
};

export default nextConfig;
