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
      '/authentik-api': {
        target: 'https://auth.slaksis.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/authentik-api/, '')
      }
    }
  }
})
