/** @type {import('next').NextConfig} */
// DJ Track Compatibility Tool
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.scdn.co",
      },
    ],
  },
  allowedDevOrigins: ["*.vusercontent.net"],
}

export default nextConfig
