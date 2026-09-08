/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The PostgreSQL driver is a Node package used only in route handlers.
  serverExternalPackages: ["pg"]
};

export default nextConfig;
