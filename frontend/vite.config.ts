import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: [
      'branding/biotelemetry-logo.png',
      'branding/human-anatomy.jpg',
      'branding/pwa-192.png',
      'branding/pwa-512.png',
    ],
    manifest: {
      name: 'BioTelemetry', short_name: 'BioTelemetry',
      description: 'Monitoring Human Health Beyond Earth',
      theme_color: '#091522', background_color: '#091522',
      display: 'standalone', start_url: '/', scope: '/',
      icons: [
        { src: '/branding/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/branding/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,jpg,svg,ico,woff2}'],
      globIgnores: ['**/*placeholder*'],
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/api(?:\/|$)/],
      // Telemetry must never be served from a stale API cache as a live reading.
      // GET/POST API requests stay network-only. IndexedDB owns offline records.
      runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' }],
      cleanupOutdatedCaches: true,
    },
  })],
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } } },
});
