import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  transpilePackages: ['mathml2omml', 'pptxgenjs', '@openmaic/importer'],
  // These agent packages do a runtime `import(specifier)` with a computed
  // specifier (to lazily load node:fs/os/path without breaking browser/Vite
  // builds). webpack can't statically analyze that and bundling it throws
  // "Cannot find module as expression is too dynamic" at runtime on the server
  // (the "Edit with AI" Pro-mode path), which broke the #619 keep-alive e2e.
  // Mark them server-external so Next loads them natively and the dynamic
  // import resolves as a real Node call.
  //
  // `undici` (ProxyAgent) is loaded from lib/ai/providers.ts via a
  // `webpackIgnore`d dynamic import to egress-proxy Vertex/Anthropic fetches on
  // the China deploy. webpackIgnore hides it from Next's standalone file
  // tracing, so without listing it here it is dropped from `.next/standalone`
  // and the proxied fetch throws MODULE_NOT_FOUND at runtime (outline/Deep
  // Solve then time out). Listing it forces Next to ship it in the standalone
  // node_modules.
  serverExternalPackages: ['@earendil-works/pi-ai', '@earendil-works/pi-agent-core', 'undici'],
  experimental: {
    proxyClientMaxBodySize: '200mb',
  },
  async headers() {
    const extraAncestors = process.env.ALLOWED_FRAME_ANCESTORS?.trim();
    const frameAncestors = extraAncestors ? `'self' ${extraAncestors}` : "'self'";

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          // X-Frame-Options only supports SAMEORIGIN (no allow-list),
          // so we omit it when custom ancestors are configured.
          ...(!extraAncestors ? [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] : []),
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${frameAncestors}; base-uri 'self'; object-src 'none'`,
          },
        ],
      },
      ...['/login', '/register', '/admin', '/api/auth/:path*', '/api/admin/:path*'].map(
        (source) => ({
          source,
          headers: [
            { key: 'Cache-Control', value: 'no-store, max-age=0' },
            { key: 'Pragma', value: 'no-cache' },
          ],
        }),
      ),
    ];
  },
};

export default nextConfig;
