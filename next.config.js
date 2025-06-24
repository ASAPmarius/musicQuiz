/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow ngrok and other development origins
  experimental: {
    allowedDevOrigins: [
      // Allow any ngrok domain
      /^https:\/\/.*\.ngrok\.io$/,
      /^https:\/\/.*\.ngrok-free\.app$/,
      /^https:\/\/.*\.ngrok\.app$/,
      // Allow localhost variants
      'localhost:3000',
      'http://localhost:3000',
      'https://localhost:3000'
    ]
  }
}

module.exports = nextConfig