import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // three.js (~140 kB gzip) is split into the lazily loaded dashboard chunk on purpose.
  build: { chunkSizeWarningLimit: 700 },
})
