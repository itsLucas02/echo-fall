import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    // Allow the Arena live-preview host to proxy the dev server.
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
  },
});
