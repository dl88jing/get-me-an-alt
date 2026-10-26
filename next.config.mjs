/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three'],
  experimental: {
    serverComponentsExternalPackages: [
      'openscad-wasm-prebuilt',
      'playwright-core',
      '@sparticuz/chromium',
      'playwright',
    ],
    outputFileTracingIncludes: {
      '/api/objects': [
        './node_modules/.pnpm/@sparticuz+chromium*/node_modules/@sparticuz/chromium/bin/**/*',
      ],
      '/api/objects/[id]': [
        './node_modules/.pnpm/@sparticuz+chromium*/node_modules/@sparticuz/chromium/bin/**/*',
      ],
      '/api/objects/[id]/stream': [
        './node_modules/.pnpm/@sparticuz+chromium*/node_modules/@sparticuz/chromium/bin/**/*',
      ],
      '/api/projects/[id]/modify': [
        './node_modules/.pnpm/@sparticuz+chromium*/node_modules/@sparticuz/chromium/bin/**/*',
      ],
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        'openscad-wasm-prebuilt': false,
        fs: false,
        path: false,
        module: false,
      };
    }
    return config;
  },
};

export default nextConfig;
