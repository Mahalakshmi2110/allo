// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Silence Prisma edge-runtime warning (we use Node runtime only)
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
  },
};

export default nextConfig;
