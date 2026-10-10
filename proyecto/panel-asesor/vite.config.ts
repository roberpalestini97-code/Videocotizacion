/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Política de contenido para el build de producción (meta). La definitiva va como encabezado HTTP en el proxy
 * (infra/); esta es la red de seguridad de la SPA. Sin imágenes remotas: el panel nunca muestra fotos.
 * Solo en `build`: en desarrollo, Vite inyecta scripts en línea para el refresco en caliente.
 */
function politicaDeContenido(): Plugin {
  const politica = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  return {
    name: 'vc-politica-de-contenido',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: politica }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), politicaDeContenido()],
  server: {
    port: 5174,
    // `npm run dev:api`: el backend real escucha en otro puerto; la cookie __Host- exige mismo origen.
    proxy:
      mode === 'development'
        ? { '/v1': { target: process.env.VC_API ?? 'http://localhost:8080', changeOrigin: false } }
        : undefined,
  },
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/preparar.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/api/generado/**', 'src/test/**', 'src/**/*.test.*', 'src/vite-env.d.ts', 'src/main.tsx'],
    },
  },
}));
