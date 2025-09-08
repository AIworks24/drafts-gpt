/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  webpack: (config) => {
    // Ensure '@' resolves to apps/web
    config.resolve.alias['@'] = config.resolve.alias['@'] || path.resolve(__dirname);
    return config;
  }
};

module.exports = nextConfig;
