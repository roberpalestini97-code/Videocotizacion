/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: el build se puede servir desde cualquier subcarpeta (infra/ de T11).
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: { input: { demo: 'demo.html' } },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
