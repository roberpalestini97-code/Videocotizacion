import { useEffect, useState } from 'react';

/** Segundos que faltan para `hasta` (ms epoch), actualizado cada segundo mientras falte tiempo. 0 = ya pasó. */
export function useSegundosRestantes(hasta: number | null): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (hasta === null) return;
    // `ahora` quedó de cuando se montó el componente: se refresca enseguida, no recién al primer segundo, para que
    // la cuenta regresiva no arranque mostrando un número viejo (y de más).
    const arranque = setTimeout(() => {
      setAhora(Date.now());
    }, 0);
    const id = setInterval(() => {
      const t = Date.now();
      setAhora(t);
      if (t >= hasta) clearInterval(id);
    }, 1000);
    return () => {
      clearTimeout(arranque);
      clearInterval(id);
    };
  }, [hasta]);
  if (hasta === null) return 0;
  return Math.max(0, Math.ceil((hasta - ahora) / 1000));
}
