import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';
import './src/libs/Env';

// Content Security Policy for SOC2 compliance (CC6.6)
// Protects against XSS attacks by controlling which resources can be loaded
// Note: Clerk uses dynamic subdomains like *.clerk.accounts.dev for each instance
const isDev = process.env.NODE_ENV === 'development';

const contentSecurityPolicy = [
  'default-src \'self\'',
  // Scripts: self + Clerk + Sentry + TokenEx/BasysPro (payment iframe) + unsafe-inline (required for Next.js theme/RSC scripts)
  'script-src \'self\' \'unsafe-inline\' https://cdn.clerk.com https://*.clerk.accounts.dev https://www.sentry-cdn.com https://sandbox.api.basyspro.com https://api.basyspro.com',
  // Styles: self + unsafe-inline (required by Clerk inline styles - cannot be avoided) + Clerk domains
  'style-src \'self\' \'unsafe-inline\' https://cdn.clerk.com https://*.clerk.accounts.dev',
  // Fonts: self only (Inter is self-hosted via next/font)
  'font-src \'self\'',
  // Images: self + all HTTPS + data URIs + blob (for Clerk avatars)
  'img-src \'self\' https: data: blob:',
  // Frames: self + Clerk for OAuth flows + TokenEx/BasysPro for payment iframe
  'frame-src \'self\' https://*.clerk.com https://*.clerk.accounts.dev https://sandbox.api.basyspro.com https://api.basyspro.com https://*.tokenex.com',
  // Workers: self + blob (for Clerk)
  'worker-src \'self\' blob:',
  // Connections: self + Clerk API + Sentry + Upstash + Better Stack + TokenEx/BasysPro
  'connect-src \'self\' https://api.clerk.com https://*.clerk.com https://*.clerk.accounts.dev https://clerk-telemetry.com https://*.ingest.sentry.io https://o-*.ingest.sentry.io https://sentry.io https://*.upstash.io https://*.betterstack.com https://logs.betterstack.com https://sandbox.api.basyspro.com https://api.basyspro.com https://*.tokenex.com',
  // Base URI: restrict to self
  'base-uri \'self\'',
  // Form actions: self + Clerk for OAuth/social login flows
  'form-action \'self\' https://*.clerk.com https://*.clerk.accounts.dev',
  // Upgrade HTTP to HTTPS (skip in dev — breaks TokenEx iframe postMessage on http://localhost)
  ...(!isDev ? ['upgrade-insecure-requests'] : []),
].join('; ');

// Security headers for SOC2 compliance
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  // Content Security Policy - enforced (change to Content-Security-Policy-Report-Only for testing)
  {
    key: 'Content-Security-Policy',
    value: contentSecurityPolicy,
  },
];

// Define the base Next.js configuration
const baseConfig: NextConfig = {
  devIndicators: {
    position: 'bottom-right',
  },
  poweredByHeader: false,
  reactStrictMode: true,
  reactCompiler: true,
  outputFileTracingIncludes: {
    '/': ['./migrations/**/*'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
    ],
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

// Initialize the Next-Intl plugin
let configWithPlugins = createNextIntlPlugin('./src/libs/I18n.ts')(baseConfig);

// Conditionally enable bundle analysis
if (process.env.ANALYZE === 'true') {
  configWithPlugins = withBundleAnalyzer()(configWithPlugins);
}

// Conditionally enable Sentry configuration
if (!process.env.NEXT_PUBLIC_SENTRY_DISABLED) {
  configWithPlugins = withSentryConfig(configWithPlugins, {
    // For all available options, see:
    // https://www.npmjs.com/package/@sentry/webpack-plugin#options
    org: process.env.SENTRY_ORGANIZATION,
    project: process.env.SENTRY_PROJECT,

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: '/monitoring',

    // Disable Sentry telemetry
    telemetry: false,

    // Webpack-specific options
    webpack: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      treeshake: {
        removeDebugLogging: true,
      },
      // Enable React component name annotations for better error tracking
      reactComponentAnnotation: {
        enabled: true,
      },
    },
  });
}

const nextConfig = configWithPlugins;
export default nextConfig;
