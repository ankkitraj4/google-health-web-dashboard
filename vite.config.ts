import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
  },
  server: {
    // Proxy backend routes to the local Express server (plan milestone M3) so
    // the browser only ever talks to the frontend's own origin — no CORS
    // needed, and /callback keeps matching the redirect URI already
    // registered in Google Cloud Console.
    proxy: {
      '/auth': 'http://localhost:8787',
      '/callback': 'http://localhost:8787',
      '/api': 'http://localhost:8787',
    },
  },
}))
