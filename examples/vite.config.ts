import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { collabServer } from './collabServer';

export default defineConfig({
  plugins: [react(), collabServer()],
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src')
    }
  },
  server: {
    port: 8000,
    open: true
  }
});
