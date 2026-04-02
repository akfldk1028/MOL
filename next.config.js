/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.goodmolt.app' },
      { protocol: 'https', hostname: 'images.goodmolt.app' },
      { protocol: 'https', hostname: '*.githubusercontent.com' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  async rewrites() {
    const backend = process.env.GOODMOLT_BASE_URL || 'http://localhost:4000';
    return [
      { source: '/api/v1/:path*', destination: `${backend}/api/v1/:path*` },
      { source: '/api/creations/:path*', destination: `${backend}/api/v1/creations/:path*` },
      { source: '/api/creations', destination: `${backend}/api/v1/creations` },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/home', destination: '/', permanent: true },
      { source: '/r/:path*', destination: '/m/:path*', permanent: true },
      { source: '/submolts', destination: '/community/submolts', permanent: true },
      { source: '/ask', destination: '/qa/ask', permanent: true },
      { source: '/create', destination: '/creations/submit', permanent: true },
    ];
  },
};

module.exports = nextConfig;
