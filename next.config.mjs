/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },
  // Bundle the seeded SQLite DB and Prisma's query-engine binary into the
  // serverless function. Without this, Vercel only ships JS files reachable
  // from imports — the .db file is data, the engine is a native `.node`
  // binary, and both would be missing at runtime.
  outputFileTracingIncludes: {
    '/**/*': [
      './prisma/dev.db',
      './node_modules/.prisma/client/*.node',
      './node_modules/@prisma/client/runtime/*.node',
    ],
  },
};

export default nextConfig;
