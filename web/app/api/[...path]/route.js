/**
 * Server-side proxy to the Catalyst Advanced I/O function.
 *
 * Why this exists: Slate serves the UI from *.onslate.in while the function runs
 * on *.catalystserverless.in. Calling the function directly from the browser
 * makes every request cross-origin, which means a CORS whitelist plus an absolute
 * API URL compiled into the bundle — and a rebuild whenever that URL changes.
 *
 * Proxying through a Next.js route instead means the browser only ever talks to
 * its own origin. The function URL becomes a server-side environment variable,
 * so it can change without rebuilding the client, and no CORS configuration is
 * needed at all.
 *
 * Zoho Projects remains the system of record and the Catalyst function remains
 * the backend — this forwards, it does not implement anything.
 *
 * Requires the Next.js hosting mode. A static export has no server, so in that
 * mode this file is not built and the client must use an absolute
 * NEXT_PUBLIC_API_BASE instead.
 */

// Never cache API responses.
export const dynamic = 'force-dynamic';

const TARGET =
  process.env.TNPC_API_URL
  || process.env.NEXT_PUBLIC_API_BASE
  || '';

/** Headers worth forwarding. Hop-by-hop and host headers must not be copied. */
const FORWARD_REQUEST_HEADERS = ['content-type', 'x-app-token', 'accept'];
const FORWARD_RESPONSE_HEADERS = ['content-type', 'cache-control'];

async function proxy(request, context) {
  if (!TARGET) {
    return Response.json(
      {
        error: {
          code: 'API_URL_NOT_CONFIGURED',
          message:
            'TNPC_API_URL is not set on the deployment. Point it at the Catalyst '
            + 'function, e.g. https://<project>.development.catalystserverless.in/server/tnpc_api',
        },
      },
      { status: 503 }
    );
  }

  const { path } = await context.params;
  const suffix = Array.isArray(path) ? path.join('/') : String(path || '');
  const search = new URL(request.url).search;
  const target = `${TARGET.replace(/\/+$/, '')}/${suffix}${search}`;

  const headers = {};
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }

  // GET and HEAD must not carry a body.
  const hasBody = !['GET', 'HEAD'].includes(request.method);

  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      cache: 'no-store',
    });
  } catch (err) {
    return Response.json(
      {
        error: {
          code: 'UPSTREAM_UNREACHABLE',
          message: `Could not reach the Catalyst function: ${err.message}`,
          target,
        },
      },
      { status: 502 }
    );
  }

  const responseHeaders = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set('Cache-Control', 'no-store');

  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
