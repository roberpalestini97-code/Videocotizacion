import { useState } from 'react';
import { Boton } from './basicos';
import { copiarTexto } from '../util/portapapeles';

export function BotonCopiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [resultado, setResultado] = useState<'ok' | 'fallo' | null>(null);
  return (
    <span className="copiar">
      <Boton
        onClick={() => {
          void copiarTexto(texto).then((ok) => {
            setResultado(ok ? 'ok' : 'fallo');
          });
        }}
      >
        {etiqueta}
      </Boton>
      <span className="copiar__estado" role="status">
        {resultado === 'ok' ? 'Copiado.' : resultado === 'fallo' ? 'No pudimos copiar: seleccioná el texto y copialo a mano.' : ''}
      </span>
    </span>
  );
}
