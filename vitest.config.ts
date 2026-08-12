import { defineConfig } from 'vitest/config'
import path from 'path'
import { createRequire } from 'module'

const { version } = createRequire(import.meta.url)('./package.json') as { version: string }

/**
 * Standalone Vitest config — deliberately does NOT reuse vite.config.ts,
 * so the PWA/react plugins don't run during unit tests.
 */
export default defineConfig({
  define: {
    // Must mirror vite.config.ts; @constants reads this at module load.
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@store': path.resolve(__dirname, 'src/store'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      '@constants': path.resolve(__dirname, 'src/constants/index'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
