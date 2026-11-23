import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const engineSrc = fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url));
const serverPort = process.env.SCRABBLE_PORT ?? '3100';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@scrabble/engine': engineSrc,
    },
  },
  server: {
    host: true, // LAN play
    proxy: {
      '/socket.io': {
        target: `http://localhost:${serverPort}`,
        ws: true,
      },
    },
  },
});
