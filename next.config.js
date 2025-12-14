/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Disable all development logging (including request logs)
  logging: false,
}

module.exports = nextConfig

