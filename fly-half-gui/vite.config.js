import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:4242' },
  },
  test: {
    environment: 'node',
    include: ['server/**/*.test.js', 'src/**/*.test.jsx'],
    environmentMatchGlobs: [['src/**', 'jsdom']],
    setupFiles: ['./src/test-setup.js'],
  },
})
