import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // '@/...' means 'src/...' (shadcn/ui's convention; tsconfig.app.json has the matching paths entry).
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // Tests talk to a mocked API at this address (see src/mocks/server.ts); it is never contacted for real.
    // TZ pins the tests to a US time zone with daylight saving time, so date code that slips into UTC is a day off in
    // the tests (as it would be for a visitor in the evening), not only on a machine set to America.
    env: { VITE_API_URL: 'http://api.test', TZ: 'America/Los_Angeles' },
  },
})
