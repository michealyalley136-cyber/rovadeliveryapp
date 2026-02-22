import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  appType: 'spa',
  server: {
    host: 'localhost',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:5000',
      '/health': 'http://localhost:5000',
    },
  },
});
