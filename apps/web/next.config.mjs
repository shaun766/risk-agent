/** @type {import('next').NextConfig} */
const apiUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  // Workspace packages (e.g. @flowmoney/shared-types) ship pre-compiled CJS —
  // Next can require them like any other node_modules dependency. Do NOT add
  // them to transpilePackages: that runs Next's Fast Refresh transform over
  // the compiled dist output in dev mode, which chokes on `import.meta` HMR
  // boilerplate it injects into what it wrongly treats as first-party source.
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // pnpm symlinks workspace packages into node_modules. Webpack's default
    // symlink resolution follows them to their real path under packages/**,
    // which no longer matches the `/node_modules/` exclusion Next's loader
    // rules use to decide what counts as first-party app source — so a
    // pre-built CJS package gets run through the Fast Refresh transform and
    // breaks on the `import.meta.webpackHot` it injects. Keeping the
    // node_modules-symlink path (instead of resolving through it) is the
    // standard fix for pnpm monorepos.
    config.resolve.symlinks = false;
    return config;
  },
  async rewrites() {
    // Proxying the API through the same origin is what lets authentication use
    // httpOnly cookies instead of putting tokens in localStorage, where any XSS
    // would hand an attacker a session.
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
