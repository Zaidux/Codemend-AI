import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}']
          },
          manifest: {
            name: 'CodeMend AI',
            short_name: 'CodeMend',
            description: 'Intelligent coding assistant that runs offline',
            theme_color: '#0f172a',
            background_color: '#0f172a',
            display: 'standalone',
            orientation: 'any',
            scope: '/',
            start_url: '/',
            icons: [
              {
                src: 'icon.jpg',
                sizes: '192x192',
                type: 'image/jpg'
              },
              {
                src: 'icon.png',
                sizes: '512x512',
                type: 'image/png'
              },
              {
                src: 'pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable'
              }
            ],
            categories: ['productivity', 'development', 'education'],
            shortcuts: [
              {
                name: 'New Chat',
                short_name: 'Chat',
                description: 'Start a new coding session',
                url: '/?new-chat',
                icons: [{ src: 'icons/chat-192.png', sizes: '192x192' }]
              },
              {
                name: 'New Project',
                short_name: 'Project',
                description: 'Create a new project',
                url: '/?new-project',
                icons: [{ src: 'icons/project-192.png', sizes: '192x192' }]
              }
            ]
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
