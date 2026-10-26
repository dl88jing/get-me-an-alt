/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three'],
  experimental: {
    serverComponentsExternalPackages: ['openscad-wasm-prebuilt'],
    outputFileTracingIncludes: {
      '/api/objects': ['./node_modules/openscad-wasm-prebuilt/**/*'],
      '/api/objects/[id]': ['./node_modules/openscad-wasm-prebuilt/**/*'],
      '/api/objects/[id]/stream': ['./node_modules/openscad-wasm-prebuilt/**/*'],
      '/api/objects/[id]/stl/[filename]': [
        './node_modules/openscad-wasm-prebuilt/**/*',
      ],
      '/api/projects/[id]/modify': [
        './node_modules/openscad-wasm-prebuilt/**/*',
      ],
      '/api/**': ['./node_modules/openscad-wasm-prebuilt/**/*'],
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
