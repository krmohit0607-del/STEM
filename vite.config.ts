import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Backend (FleetViewCore) dev URL. See FleetViewCore/Properties/launchSettings.json.
const BACKEND = process.env.FLEETVIEW_BACKEND_URL ?? 'https://localhost:5001';

export default defineConfig({
    base: process.env.GITHUB_PAGES === 'true' ? '/FleetViewCore.WebApp/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // All routes that should be served by the .NET backend.
      // Vite proxies them so the React dev server is same-origin to the
      // browser; cookie auth (ASP.NET Identity) keeps working unchanged.
      '/api': { target: BACKEND, changeOrigin: true, secure: false },
      '/Account': { target: BACKEND, changeOrigin: true, secure: false },
      '/Home': { target: BACKEND, changeOrigin: true, secure: false },
      '/Search': { target: BACKEND, changeOrigin: true, secure: false },
      '/Admin': { target: BACKEND, changeOrigin: true, secure: false },
      '/Report': { target: BACKEND, changeOrigin: true, secure: false },
      '/swagger': { target: BACKEND, changeOrigin: true, secure: false },
      '/MicrosoftIdentity': { target: BACKEND, changeOrigin: true, secure: false },
      '/signin-microsoft': { target: BACKEND, changeOrigin: true, secure: false },
      '/interimhub': {
        target: BACKEND,
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
});
