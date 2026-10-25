import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // Tests talk to a mocked API at this address (see src/mocks/server.ts); it is never contacted for real.
    env: { VITE_API_URL: 'http://api.test' },
  },
})
