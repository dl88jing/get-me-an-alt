/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three'],
  experimental: {
    serverComponentsExternalPackages: [],
  },
};

export default nextConfig;
