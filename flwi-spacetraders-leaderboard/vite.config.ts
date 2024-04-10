import path from "path"
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {TanStackRouterVite} from '@tanstack/router-vite-plugin'


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    TanStackRouterVite(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    proxy: {
      // For requests to /api/**, drop the prefix and proxy the rest to the backend.
      "/api": {
        target: "http://localhost:8080",
        //changeOrigin: true,
        //secure: false,
        //rewrite: path => path.replace('/api', '/api'),
      },
    },
  }
})
