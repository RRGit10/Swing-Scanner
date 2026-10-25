import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The API listens on 127.0.0.1 only. Browser tests run a second, read-only API on another port.
const apiPort = process.env.API_PORT ?? '3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
});
