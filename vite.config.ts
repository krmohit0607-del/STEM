import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

const NAUTICAL_TILES = 'C:\\Users\\CHMOKUM\\Documents\\NauticalTileDownloader\\tiles';

function nauticalTilesPlugin() {
  return {
    name: 'serve-local-nautical-tiles',
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use((req: { url?: string }, res: { statusCode: number; setHeader: Function; end: Function }, next: Function) => {
        const match = req.url?.match(/^\/nautical-tiles\/(\d+)\/(\d+)\/(\d+)\.png(?:\?.*)?$/);
        if (!match) {
          next();
          return;
        }

        const filePath = path.join(NAUTICAL_TILES, match[1], match[2], `${match[3]}.png`);
        if (!fs.existsSync(filePath)) {
          res.statusCode = 404;
          res.end();
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        fs.createReadStream(filePath).pipe(res as never);
      });
    },
  };
}

// Backend dev URL. Defaults to http://localhost:5000 (with HTTPS fallback at https://localhost:5001).
const BACKEND = process.env.FLEETVIEW_BACKEND_URL ?? 'http://127.0.0.1:5000';

export default defineConfig({
    base: process.env.GITHUB_PAGES === 'true' ? '/FleetViewCore.WebApp/' : '/',
  plugins: [react(), nauticalTilesPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/backend/**', '**/node_modules/**'],
    },
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
      // NGA World Port Index — proxied to stay same-origin (avoids CORS).
      '/wpi': {
        target: 'https://msi.nga.mil',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/wpi/, ''),
      },
      '/interimhub': {
        target: BACKEND,
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
});
