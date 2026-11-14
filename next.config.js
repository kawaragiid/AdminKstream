const isProd = process.env.NODE_ENV === "production";

const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(isProd ? [] : ["'unsafe-eval'"]),
  "https://apis.google.com",
  "https://*.gstatic.com",
  "https://www.gstatic.com",
  "https://*.firebaseapp.com",
  "https://*.web.app",
  "https://www.google.com",
  "https://www.recaptcha.net",
].join(" ");

const cspDirectives = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://*.firebase.com https://*.web.app https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.google.com https://www.recaptcha.net https://*.mux.com https://*.fastly.net https://*.akamaized.net https://*.cloudfront.net https://storage.googleapis.com https://*.vercel-storage.com",
  "worker-src 'self' blob:",
  "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com https://*.web.app https://www.google.com https://www.recaptcha.net",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Content-Security-Policy", value: cspDirectives },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
