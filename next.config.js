import withPWAInit from "@ducanh2912/next-pwa";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const disablePWA =
  process.env.NODE_ENV === "development" ||
  process.env.HOMIOS_DISABLE_PWA === "true" ||
  process.platform === "win32";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: disablePWA,
  publicExcludes: [
    "!noprecache/**/*",
    "!data/**/*",
    "!data_mock/**/*",
    "!coolify/**/*",
    "!node_modules/**/*",
    "!**/.git/**/*",
    "!**/.next/**/*",
    "!**/Cookies/**/*",
  ],
  workboxOptions: {
    maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    exclude: [
      /\/_next\/static\/.*(?<!\.p)\.woff2/,
      /\.map$/,
      /^manifest.*\.js$/,
      /(?:^|[\\/])data(?:[\\/]|$)/,
      /(?:^|[\\/])data_mock(?:[\\/]|$)/,
      /(?:^|[\\/])coolify(?:[\\/]|$)/,
      /(?:^|[\\/])node_modules(?:[\\/]|$)/,
      /(?:^|[\\/])Cookies(?:[\\/]|$)/,
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: projectRoot,
  outputFileTracingExcludes: {
    "/*": [
      "C:/Users/**/*",
      "C:\\Users\\**\\*",
      "/home/**/*",
      "/root/**/*",
      "data/**/*",
      "data_mock/**/*",
      "coolify/**/*",
      "node_modules/**/*",
    ],
  },
  // Type and lint errors fail the build. They used to be ignored, which meant a
  // broken auth check could ship as long as it parsed. CI runs `tsc --noEmit`
  // and `next lint` on top of this.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  webpack(config, { dev, isServer }) {
    if (isServer && !dev) {
      const traceIgnores = [
        "../**",
        "..\\**",
        "C:/Users/**",
        "C:\\Users\\**",
        "/home/**",
        "/root/**",
      ];

      for (const plugin of config.plugins || []) {
        if (plugin?.constructor?.name === "TraceEntryPointsPlugin") {
          plugin.traceIgnores = Array.from(new Set([...(plugin.traceIgnores || []), ...traceIgnores]));
        }
      }
    }
    return config;
  },
};

export default withPWA(nextConfig);
