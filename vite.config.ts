import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const THEME_COLOR = '#f9f6f1';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Minha Casinha',
        short_name: 'Minha Casinha',
        description: 'Desenhe a planta baixa da sua casa no celular ou no computador.',
        lang: 'pt-BR',
        theme_color: THEME_COLOR,
        background_color: THEME_COLOR,
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        file_handlers: [{ action: '/', accept: { 'application/json': ['.casinha.json'] } }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf}'],
        maximumFileSizeToCacheInBytes: 3_000_000,
      },
    }),
  ],
  build: { target: 'es2024' },
});
