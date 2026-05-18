import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devPort = Number(env.VITE_PORT || process.env.VITE_PORT) || 5173

  return {
  plugins: [react()],
  server: {
    port: devPort,
    strictPort: false,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('react-dom') || (id.includes('/react/') && !id.includes('react-dom'))) return 'vendor-react';
          if (id.includes('dexie')) return 'vendor-db';
          if (id.includes('node_modules')) return 'vendor-misc';
        },
      },
    },
  },
  }
})
