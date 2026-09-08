import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    cors: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.SGA_LOCAL_API_TARGET || 'http://127.0.0.1:8080',
        changeOrigin: true
      },
      '/authentik-api': {
        target: 'https://auth.slaksis.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/authentik-api/, '')
      }
    }
  }
})
