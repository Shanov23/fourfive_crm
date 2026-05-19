/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: true },
  async headers() {
    return [{ source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] }]
  }
}
module.exports = nextConfig
