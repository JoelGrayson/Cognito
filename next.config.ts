import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only. The dev server refuses its own scripts to any hostname but localhost, so
  // the page loads blank through a tunnel. Testing handwriting needs a real tablet, and
  // the microphone needs HTTPS, which on an iPad means a tunnel.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io"],
};

export default nextConfig;
