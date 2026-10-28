import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths so the built site works from any folder or static host.
  base: './',
  plugins: [react()],
  server: { port: 5199 },
  test: {
    environment: 'jsdom',
  },
} as never);
