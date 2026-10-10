import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './estilos/tokens.css';
import './estilos/base.css';

async function arrancar() {
  let fetchImpl: typeof fetch | undefined;
  // `import.meta.env.DEV` es `false` literal en el build de producción: Rollup elimina esta rama completa y el
  // mock (con sus credenciales de demo) no entra al bundle. scripts/verificar-dist.mjs lo comprueba.
  if (import.meta.env.DEV && import.meta.env.VITE_USAR_MOCK === '1') {
    const { fetchSimulado } = await import('./dev/entrada-mock');
    fetchImpl = fetchSimulado;
  }
  const raiz = document.getElementById('raiz');
  if (!raiz) throw new Error('Falta el elemento #raiz');
  createRoot(raiz).render(
    <StrictMode>
      <App {...(fetchImpl ? { fetchImpl } : {})} {...(import.meta.env.VITE_API_BASE ? { baseUrl: import.meta.env.VITE_API_BASE } : {})} />
    </StrictMode>,
  );
}

void arrancar();
