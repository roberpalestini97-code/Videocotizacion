import { Boton } from './basicos';
import { Dialogo } from './Dialogo';

interface Props {
  titulo: string;
  descripcion: string;
  textoConfirmar: string;
  peligro?: boolean;
  alConfirmar: () => void;
  alCancelar: () => void;
}

export function ConfirmarDialogo({ titulo, descripcion, textoConfirmar, peligro = false, alConfirmar, alCancelar }: Props) {
  return (
    <Dialogo titulo={titulo} descripcion={descripcion} alCerrar={alCancelar}>
      <div className="acciones">
        {/* El foco inicial va en "Cancelar": la opción segura. */}
        <Boton data-foco-inicial="" onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton variante={peligro ? 'peligro' : 'primario'} onClick={alConfirmar}>
          {textoConfirmar}
        </Boton>
      </div>
    </Dialogo>
  );
}
