/**
 * Two supported hosting modes on Catalyst Slate.
 *
 * 1. Next.js framework (default here)
 *    Slate builds and runs the app server-side via OpenNext. Server routes work,
 *    which means app/api/[...path]/route.js can proxy the Catalyst function and
 *    the browser only ever talks to its own origin — no CORS, no absolute API
 *    URL baked into the bundle.
 *
 * 2. Static export      NEXT_STATIC_EXPORT=true
 *    Produces plain files in out/. No server, so the proxy route does not exist
 *    and the client must be built with an absolute NEXT_PUBLIC_API_BASE.
 *
 * Mode 2 is the fallback: it has been verified end to end, while mode 1 depends
 * on Slate's Next.js runtime, which could not be exercised while building this.
 * Keep both working rather than betting on one.
 */

const staticExport = process.env.NEXT_STATIC_EXPORT === 'true';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // OpenNext rejects `output: 'export'`, so it is only set for the static path.
  ...(staticExport ? { output: 'export' } : {}),

  basePath: basePath || undefined,

  // Relative asset URLs only make sense for a static export served from an
  // unknown path. In server mode Next.js needs to own its own asset routing.
  ...(staticExport ? { assetPrefix: basePath || './' } : {}),

  trailingSlash: staticExport,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
};

export default nextConfig;
