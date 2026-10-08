// Preparación común de vitest (ver vite.config.ts → test.setupFiles).
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Testing Library solo sabe esperar con relojes falsos si ve un global `jest` (no lo hay en vitest): se le da uno
// mínimo que avanza el reloj falso de vitest. Sin esto, `findBy*` se cuelga cuando una prueba usa vi.useFakeTimers().
Object.assign(globalThis, { jest: { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) } });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.title = '';
  document.body.removeAttribute('inert');
});

beforeEach(() => {
  // jsdom no implementa descargas ni object URLs: se dejan como espías que no hacen nada (las pruebas de
  // exportación leen `HTMLAnchorElement.prototype.click` para ver qué archivo se habría bajado).
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:prueba'), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
