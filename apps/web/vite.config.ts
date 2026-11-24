import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const engineSrc = fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url));

export default defineConfig(({ mode }) => {
  // `.env` files are not loaded into `process.env` while this config runs, so
  // read them explicitly. The empty prefix loads vars not prefixed with VITE_.
  const env = loadEnv(mode, process.cwd(), '');
  const serverPort = env['SCRABBLE_PORT'] ?? '3100';
  const allowedHosts = env['ALLOWED_HOSTS']
    ?.split(',')
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@scrabble/engine': engineSrc,
      },
    },
    server: {
      host: true, // LAN play
      allowedHosts,
      proxy: {
        '/socket.io': {
          target: `http://localhost:${serverPort}`,
          ws: true,
        },
      },
    },
  };
});
