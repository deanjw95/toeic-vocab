import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the build also works from a sub-path (GitHub Pages) or a file server.
export default defineConfig({
  base: './',
  plugins: [react()],
});
