import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
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
})
