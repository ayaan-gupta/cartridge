import type { NextConfig } from 'next'

const config: NextConfig = {
  // sharp is a native module, so it stays out of the bundle.
  serverExternalPackages: ['sharp'],
  // Design-time art is read from disk at request time, which the tracer
  // cannot see, so it is listed here for a serverless bundle.
  outputFileTracingIncludes: {
    '/**': ['./assets/generated/**', './assets/interim/**'],
  },
}

export default config
