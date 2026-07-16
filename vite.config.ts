import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The production build is served from https://<user>.github.io/Karate/, so its
// asset URLs must be prefixed with that sub-path. Dev keeps the root base so the
// local server stays at http://localhost:5175/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Karate/' : '/',
  plugins: [react()],
  server: { port: 5175 },
}));
