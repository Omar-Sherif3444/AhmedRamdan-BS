import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const here = import.meta.dirname
const project = resolve(here, '../../..')
export default defineConfig({
  root: project,
  plugins: [
    {
      name: 'offline-mocks',
      enforce: 'pre',
      resolveId(id, importer) {
        if (id === 'three/addons/controls/OrbitControls.js' && importer && !importer.includes('orbit-spy')) return resolve(here, 'orbit-spy.ts')
        if (!importer || importer.includes('capture')) return null
        if (/\/lib\/api(\.ts)?$/.test(id) || id === './api') return resolve(here, 'mock-api.ts')
        if (/\/lib\/supabase(\.ts)?$/.test(id) || id === './supabase') return resolve(here, 'mock-supabase.ts')
        return null
      },
    },
    react(),
  ],
  server: { port: 5199, strictPort: true },
})
