import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Where the Java API lives when running `npm run dev` locally (outside Docker).
  // Override by setting VITE_DEV_PROXY_TARGET in react-ui/.env
  const apiTarget = env.VITE_DEV_PROXY_TARGET || 'http://localhost:8080'
  const wsTarget = apiTarget.replace(/^http/, 'ws')

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3001,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/ws': {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            pdf: ['react-pdf', 'pdfjs-dist'],
            charts: ['recharts'],
            stomp: ['@stomp/stompjs', 'sockjs-client'],
          },
        },
      },
    },
  }
})
