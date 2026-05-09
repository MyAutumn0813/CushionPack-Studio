import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxy = {
  '/api': {
    target: 'http://localhost:8787',
    changeOrigin: true,
  },
}

const allowedHosts = ['cushionpackaging.fy.takin.cc']

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts,
    proxy: apiProxy,
  },
  preview: {
    allowedHosts,
    proxy: apiProxy,
  },
})
