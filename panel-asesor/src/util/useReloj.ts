import { useEffect, useState } from 'react';

/** Segundos que faltan para `hasta` (ms epoch), actualizado cada segundo mientras falte tiempo. 0 = ya pasó. */
export function useSegundosRestantes(hasta: number | null): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (hasta === null) return;
    const id = setInterval(() => {
      setAhora(Date.now());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [hasta]);
  if (hasta === null) return 0;
  return Math.max(0, Math.ceil((hasta - ahora) / 1000));
}
